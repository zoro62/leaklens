import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'LeakLens · Review before you share', description: 'Local screenshot analysis and permanent image redaction. Review text, QR payloads, and connected disclosures on your device.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
