import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="icon" type="image/png" sizes="512x512" href="/favicon-512.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="512x512" href="/favicon-512.png" />
        <meta name="theme-color" content="#0B1F3A" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const globalCss = `
html, body, #root { min-height: 100%; }
body {
  margin: 0;
  background-color: #F4F7FB;
  color: #0F172A;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
html[data-theme='dark'] body {
  background-color: #0B1F3A;
  color: #EAF0FF;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme='light']) body {
    background-color: #0B1F3A;
    color: #EAF0FF;
  }
}
`;
