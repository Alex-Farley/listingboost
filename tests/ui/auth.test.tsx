import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, renderApp, fireEvent, screen, waitFor } from "./harness";
import { createTestApp, signUp } from "../support/app";

afterEach(cleanup);

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("AT-01 sign up and sign in through the UI", () => {
  test("protected pages redirect to sign-in", async () => {
    const { router } = renderApp("/app/listings");
    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeTruthy();
  });

  test("signing up creates the account and opens My Listings", async () => {
    const { router, app } = renderApp("/signup");
    type(/your name/i, "Jane Agent");
    type(/agency name/i, "Orchard Estates");
    type(/email/i, "jane@orchard.test");
    type(/password/i, "a long enough password");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/listings"));
    expect(await screen.findByText("Orchard Estates")).toBeTruthy();
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBe(1);
  });

  test("sign-up shows field errors from the server", async () => {
    renderApp("/signup");
    type(/your name/i, "Jane");
    type(/agency name/i, "Orchard");
    type(/email/i, "jane@orchard.test");
    type(/password/i, "short");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText(/at least 12 characters/i)).toBeTruthy();
  });

  test("wrong password shows a generic error; correct password signs in", async () => {
    const app = createTestApp();
    const account = await signUp(app);
    const { router } = renderApp("/signin", app);
    type(/email/i, account.email);
    type(/password/i, "not the right password");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/email or password is incorrect/i)).toBeTruthy();
    type(/password/i, account.password);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app/listings"));
  });

  test("signing out ends the session", async () => {
    const { router } = renderApp("/signup");
    type(/your name/i, "Jane");
    type(/agency name/i, "Orchard");
    type(/email/i, "out@orchard.test");
    type(/password/i, "a long enough password");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    await router.navigate("/app/listings");
    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
  });
});
