import { LoginForm } from '@launchpad/shell';

// The sign-in page is entirely the shared shell. On success it goes to the
// costing queue.
export default function LoginPage() {
  return <LoginForm brand="Ayonz · Product Costing" redirectTo="/queue" />;
}
