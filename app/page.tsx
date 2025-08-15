// app/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';

export default async function Home() {
  const session = await auth();
  redirect(session ? '/dashboard' : '/sign-in');
}
