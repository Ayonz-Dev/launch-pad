import { redirect } from 'next/navigation';

// The app proper lives under /queue. Send the root there; the (app) layout
// bounces to /login when there is no session.
export default function Home() {
  redirect('/queue');
}
