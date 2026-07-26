import { redirect } from 'next/navigation';

// The app proper lives under /dashboard. Send the root there; the (app) layout
// bounces to /login when there is no session.
export default function Home() {
  redirect('/dashboard');
}
