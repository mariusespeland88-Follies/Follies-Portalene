export const metadata = {
  title: 'Follies Portalen',
  description: 'Ansattportal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="no">
      <body>{children}</body>
    </html>
  );
}
