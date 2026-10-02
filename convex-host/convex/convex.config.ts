import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// The app owns the root so it can keep the site's clean URLs; the component serves the files.
const app = defineApp();
app.use(staticHosting);

export default app;
