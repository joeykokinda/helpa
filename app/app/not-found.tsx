import Link from "next/link";
import Helpa from "./components/Helpa";

export default function NotFound() {
  return (
    <main className="not-found">
      <Helpa mood="worried" size={140} />
      <h1>Nothing to fix here.</h1>
      <p>This page doesn&apos;t exist. Let&apos;s get you back to something that does.</p>
      <div className="not-found-actions">
        <Link href="/app" className="btn btn-primary press">
          Open Helpa
        </Link>
        <Link href="/" className="btn btn-secondary press">
          Home page
        </Link>
      </div>
    </main>
  );
}
