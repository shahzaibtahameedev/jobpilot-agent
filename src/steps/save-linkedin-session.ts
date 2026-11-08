import { chromium } from "playwright";
import type { BrowserContext } from "playwright";
import {
    BROWSER_CHANNEL,
    DATA_PATHS,
    ENV_KEYS,
    ENV_PLACEHOLDER_MARKER,
    LINKEDIN_SESSION_COOKIE,
    LINKEDIN_URLS,
    STEP_NAMES,
} from "../constants.ts";
import { readOptionalEnv } from "../utils/env-utils.ts";
import { log } from "../utils/logger.ts";

// Opens LinkedIn in the shared browser profile and closes it once the feed loads, which saves the session.
export async function saveLinkedInSession(): Promise<void> {
    const context = await chromium.launchPersistentContext(DATA_PATHS.BROWSER_PROFILE_DIR, {
        channel: BROWSER_CHANNEL,
        headless: false,
        viewport: null,
    });

    await addSessionCookie(context);

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(LINKEDIN_URLS.FEED);
    log(`[${STEP_NAMES.LOGIN}] sign in to LinkedIn in the Chrome window if asked. It closes on its own once your feed loads.`);

    try {
        await page.waitForURL((url) => url.href.startsWith(LINKEDIN_URLS.FEED), { timeout: 0 });
    } catch {
        throw new Error("The login window was closed before sign-in finished. Run `npm run login` again.");
    }

    await context.close();
    log(`[${STEP_NAMES.LOGIN}] session saved to ${DATA_PATHS.BROWSER_PROFILE_DIR}`);
}

async function addSessionCookie(context: BrowserContext): Promise<void> {
    const sessionCookie = readOptionalEnv(ENV_KEYS.LINKEDIN_LI_AT);
    const hasSessionCookie = sessionCookie.length > 0 && !sessionCookie.includes(ENV_PLACEHOLDER_MARKER);

    if (!hasSessionCookie) {
        log(`[${STEP_NAMES.LOGIN}] ${ENV_KEYS.LINKEDIN_LI_AT} is not set in .env, so you will need to sign in by hand.`);
        return;
    }

    const expiresAt = Math.floor(Date.now() / 1000) + LINKEDIN_SESSION_COOKIE.LIFETIME_DAYS * 24 * 60 * 60;

    await context.addCookies([
        {
            name: LINKEDIN_SESSION_COOKIE.NAME,
            value: sessionCookie,
            domain: LINKEDIN_SESSION_COOKIE.DOMAIN,
            path: LINKEDIN_SESSION_COOKIE.PATH,
            expires: expiresAt,
            httpOnly: true,
            secure: true,
            sameSite: "None",
        },
    ]);
}
