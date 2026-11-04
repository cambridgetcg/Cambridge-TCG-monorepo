import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

import { login } from "../shopify.server";

/**
 * login() sends any request that names a shop on to Shopify. Anyone else
 * is sent to the App Store listing, where they can install or open the
 * app: the App Store does not allow a page asking merchants to type their
 * shop domain (requirement 2.3.1). The form stays for local development.
 */
const APP_STORE_LISTING = "https://apps.shopify.com/rewards-pro";

function loginErrorMessage(loginErrors: LoginError): { shop?: string } {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }

  return {};
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  if (process.env.NODE_ENV !== "development") {
    throw redirect(APP_STORE_LISTING);
  }

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  // A plain form, like the CLI 5 scaffold's: this page only renders in local
  // development and sits outside AppProvider, which is what loads Polaris.
  return (
    <main>
      <Form method="post">
        <h1>Log in</h1>
        <label>
          Shop domain
          <input
            type="text"
            name="shop"
            value={shop}
            onChange={(e) => setShop(e.currentTarget.value)}
            autoComplete="on"
            aria-describedby="shop-help"
          />
        </label>
        <p id="shop-help">{errors.shop ?? "example.myshopify.com"}</p>
        <button type="submit">Log in</button>
      </Form>
    </main>
  );
}
