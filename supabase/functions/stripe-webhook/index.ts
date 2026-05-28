import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/**
 * Webhook Stripe → Supabase.
 * - Valida assinatura (`STRIPE_WEBHOOK_SECRET`)
 * - Persiste idempotência em `billing_webhook_events`
 *
 * Complete os handlers de negócio (`historico_faturas`, `assinaturas_clientes`, etc.)
 * conforme o schema real do Azoup e seus status internos.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!stripeSecret || !webhookSecret || !supabaseUrl || !serviceRole) {
      throw new Error('Configure STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL e SERVICE_ROLE_KEY.');
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });
    const supabase = createClient(supabaseUrl, serviceRole);

    const signature = req.headers.get('stripe-signature');
    if (!signature) return new Response('Missing stripe-signature', { status: 400 });

    const rawBody = await req.text();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    const eventId = event.id;
    const { error: insertErr } = await supabase.from('billing_webhook_events').insert({
      stripe_event_id: eventId,
      tipo: event.type,
      payload: event as unknown as Record<string, unknown>,
      processado_em: new Date().toISOString(),
    } as never);

    // Idempotência simples: se violar unique em stripe_event_id, consideramos reprocessamento seguro.
    if (insertErr && !`${insertErr.message}`.toLowerCase().includes('duplicate')) {
      throw insertErr;
    }

    // TODO: sincronizar assinatura/fatura local conforme `event.type`.

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Webhook error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
