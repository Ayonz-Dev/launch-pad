import { LoginForm } from "@launchpad/shell";

// Sign-in is the shared shell. Same platform identity as every other app; on
// success it lands on the shipments home.
export default function LoginPage() {
  return <LoginForm brand="Ayonz · Control Tower" redirectTo="/" />;
}
