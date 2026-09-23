import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'TISS · Student Monitoring', description: 'Student monitoring and parent communication' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
