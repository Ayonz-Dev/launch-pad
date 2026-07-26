import { LoginForm } from '@launchpad/shell';

// The sign-in page is entirely the shared shell. Same identity model as every
// other app; only the brand and landing route differ.
export default function LoginPage() {
  return <LoginForm brand="Ayonz · Hedging" redirectTo="/dashboard" />;
}
