import { LoginForm } from '@launchpad/shell';

// Sign-in is the shared shell. Same platform identity as the other apps; on
// success it returns to the coverage dashboard.
export default function LoginPage() {
  return <LoginForm brand="Ayonz · Hedging" redirectTo="/" />;
}
