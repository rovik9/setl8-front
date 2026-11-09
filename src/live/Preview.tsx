import { Link } from "react-router-dom";
import LivePanel from "./Panel";
import "../pyth/terminal.css";
/** Public market observations only. Account routes keep their wallet authentication. */
export default function LivePreview() {
  return (
    <main
      id="main-content"
      style={{ maxWidth: 1200, margin: "32px auto", padding: 20 }}
    >
      <Link to="/app/terminal?view=live">Open in terminal workspace</Link>
      <LivePanel />
    </main>
  );
}
