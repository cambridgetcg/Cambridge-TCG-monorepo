import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  BlockStack,
  Box,
  Text,
  Badge,
  Divider,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";

/**
 * Widget Detection Test Page
 * Tests the GraphQL queries used to detect widget embed status in themes
 */

interface ThemeInfo {
  id: string;
  name: string;
  role: string;
}

interface WidgetDetectionResult {
  success: boolean;
  shop: string;
  executionTime: number;

  // Step 1: Theme query
  themeQuery: {
    query: string;
    response: any;
    mainTheme: ThemeInfo | null;
    error: string | null;
  };

  // Step 2: Settings query
  settingsQuery: {
    query: string;
    response: any;
    settingsData: any;
    error: string | null;
  } | null;

  // Step 3: Detection result
  detection: {
    isEnabled: boolean;
    blockType: 'app_embed' | 'section' | 'none';
    blocksFound: Array<{
      blockId: string;
      type: string;
      disabled: boolean;
      isOurApp: boolean;
    }>;
  } | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return json({
    shop: session.shop,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const result: WidgetDetectionResult = {
    success: false,
    shop: session.shop,
    executionTime: 0,
    themeQuery: {
      query: '',
      response: null,
      mainTheme: null,
      error: null,
    },
    settingsQuery: null,
    detection: null,
  };

  try {
    // ============================================
    // STEP 1: Get Main Theme
    // ============================================
    const themeQuery = `
      query GetMainTheme {
        themes(first: 10, roles: [MAIN]) {
          nodes {
            id
            name
            role
          }
        }
      }
    `;

    result.themeQuery.query = themeQuery;

    const themeResponse = await admin.graphql(themeQuery);
    const themeData = await themeResponse.json();
    result.themeQuery.response = themeData;

    if (themeData.errors) {
      result.themeQuery.error = JSON.stringify(themeData.errors);
      result.executionTime = Date.now() - startTime;
      return json(result);
    }

    const mainTheme = themeData.data?.themes?.nodes?.[0];
    if (!mainTheme) {
      result.themeQuery.error = "No main theme found";
      result.executionTime = Date.now() - startTime;
      return json(result);
    }

    result.themeQuery.mainTheme = mainTheme;

    // ============================================
    // STEP 2: Get Theme Settings
    // ============================================
    const settingsQuery = `
      query GetThemeSettings($themeId: ID!) {
        theme(id: $themeId) {
          id
          name
          files(filenames: ["config/settings_data.json"], first: 1) {
            nodes {
              filename
              body {
                ... on OnlineStoreThemeFileBodyText {
                  content
                }
              }
            }
          }
        }
      }
    `;

    result.settingsQuery = {
      query: settingsQuery,
      response: null,
      settingsData: null,
      error: null,
    };

    const settingsResponse = await admin.graphql(settingsQuery, {
      variables: { themeId: mainTheme.id },
    });
    const settingsResponseData = await settingsResponse.json();
    result.settingsQuery.response = settingsResponseData;

    if (settingsResponseData.errors) {
      result.settingsQuery.error = JSON.stringify(settingsResponseData.errors);
      result.executionTime = Date.now() - startTime;
      return json(result);
    }

    const fileContent = settingsResponseData.data?.theme?.files?.nodes?.[0]?.body?.content;
    if (!fileContent) {
      // Provide more detailed error message
      const filesNodes = settingsResponseData.data?.theme?.files?.nodes;
      if (!filesNodes || filesNodes.length === 0) {
        result.settingsQuery.error = "Theme files query returned no files. The theme may not have a settings_data.json file, or the theme structure may be non-standard.";
      } else if (!filesNodes[0]?.body) {
        result.settingsQuery.error = "File found but body is empty. The settings_data.json may be corrupted or inaccessible.";
      } else if (!filesNodes[0]?.body?.content) {
        result.settingsQuery.error = "File body exists but content is null. This may indicate a permission issue or the file is binary.";
      } else {
        result.settingsQuery.error = "No settings_data.json content found in theme (unknown reason)";
      }
      result.executionTime = Date.now() - startTime;
      return json(result);
    }

    // Parse the settings JSON
    try {
      // Remove comments (Shopify themes sometimes have comments in JSON)
      const cleanedContent = fileContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      result.settingsQuery.settingsData = JSON.parse(cleanedContent);
    } catch (parseError: any) {
      result.settingsQuery.error = `Failed to parse settings_data.json: ${parseError.message}`;
      result.executionTime = Date.now() - startTime;
      return json(result);
    }

    // ============================================
    // STEP 3: Detect Widget Blocks
    // ============================================
    const APP_EXTENSION_HANDLE = "rewardspro-theme-extension";
    const MEMBERSHIP_WIDGET_BLOCK = "membership_widget";

    const settingsData = result.settingsQuery.settingsData;
    const current = settingsData?.current;

    result.detection = {
      isEnabled: false,
      blockType: 'none',
      blocksFound: [],
    };

    if (current) {
      // Check blocks at root level (app embeds)
      const blocks = current.blocks || {};
      for (const [blockId, blockData] of Object.entries(blocks)) {
        const block = blockData as any;
        if (block.type && typeof block.type === 'string') {
          const isOurApp = block.type.includes(APP_EXTENSION_HANDLE) ||
                           block.type.includes(MEMBERSHIP_WIDGET_BLOCK);

          result.detection.blocksFound.push({
            blockId,
            type: block.type,
            disabled: block.disabled === true,
            isOurApp,
          });

          if (isOurApp && block.disabled !== true) {
            result.detection.isEnabled = true;
            result.detection.blockType = 'app_embed';
          }
        }
      }

      // Check sections for app blocks
      const sections = current.sections || {};
      for (const [sectionId, sectionData] of Object.entries(sections)) {
        const section = sectionData as any;

        // Check section type
        if (section.type && typeof section.type === 'string') {
          const isOurApp = section.type.includes(APP_EXTENSION_HANDLE) ||
                           section.type.includes(MEMBERSHIP_WIDGET_BLOCK);

          if (isOurApp) {
            result.detection.blocksFound.push({
              blockId: sectionId,
              type: section.type,
              disabled: section.disabled === true,
              isOurApp,
            });

            if (section.disabled !== true) {
              result.detection.isEnabled = true;
              result.detection.blockType = 'section';
            }
          }
        }

        // Check blocks within sections
        const sectionBlocks = section.blocks || {};
        for (const [blockId, blockData] of Object.entries(sectionBlocks)) {
          const block = blockData as any;
          if (block.type && typeof block.type === 'string') {
            const isOurApp = block.type.includes(APP_EXTENSION_HANDLE) ||
                             block.type.includes(MEMBERSHIP_WIDGET_BLOCK);

            if (isOurApp) {
              result.detection.blocksFound.push({
                blockId: `${sectionId}/${blockId}`,
                type: block.type,
                disabled: block.disabled === true,
                isOurApp,
              });

              if (block.disabled !== true) {
                result.detection.isEnabled = true;
                result.detection.blockType = 'section';
              }
            }
          }
        }
      }
    }

    result.success = true;
    result.executionTime = Date.now() - startTime;
    return json(result);

  } catch (error: any) {
    result.themeQuery.error = error.message || "Unknown error";
    result.executionTime = Date.now() - startTime;
    return json(result);
  }
}

export default function WidgetTestPage() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Page
      title="Widget Detection Test"
      subtitle={`Testing widget embed detection for ${shop}`}
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <BlockStack gap="400">
        {/* Info Banner */}
        <Banner tone="info">
          <p>
            This page tests the GraphQL queries used to detect if the RewardsPro widget
            is enabled in your theme. It shows the raw request/response data for debugging.
          </p>
        </Banner>

        {/* Test Button */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Run Widget Detection Test</Text>
              <Text as="p" tone="subdued">
                Click the button below to execute the widget detection queries against your store's theme.
              </Text>
              <Divider />
              <Form method="post" onSubmit={() => setIsSubmitting(true)}>
                <Button
                  submit
                  variant="primary"
                  loading={isSubmitting && !actionData}
                >
                  Test Widget Detection
                </Button>
              </Form>
            </BlockStack>
          </Box>
        </Card>

        {/* Results */}
        {actionData && (
          <>
            {/* Summary Card */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Detection Result</Text>
                    <InlineStack gap="200">
                      <Badge tone="info">{actionData.executionTime}ms</Badge>
                      {actionData.success ? (
                        actionData.detection?.isEnabled ? (
                          <Badge tone="success">Widget Enabled</Badge>
                        ) : (
                          <Badge tone="warning">Widget Not Enabled</Badge>
                        )
                      ) : (
                        <Badge tone="critical">Detection Failed</Badge>
                      )}
                    </InlineStack>
                  </InlineStack>

                  <Divider />

                  {actionData.success && actionData.detection && (
                    <BlockStack gap="300">
                      <InlineStack gap="400">
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">Status</Text>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {actionData.detection.isEnabled ? "Enabled" : "Disabled"}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">Block Type</Text>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {actionData.detection.blockType === 'app_embed' ? 'App Embed' :
                             actionData.detection.blockType === 'section' ? 'Section Block' : 'None'}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">Theme</Text>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {actionData.themeQuery.mainTheme?.name || "Unknown"}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">Blocks Found</Text>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {actionData.detection.blocksFound.filter(b => b.isOurApp).length} app block(s)
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>

            {/* Step 1: Theme Query */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Step 1: Get Main Theme</Text>
                    {actionData.themeQuery.mainTheme ? (
                      <Badge tone="success">Success</Badge>
                    ) : actionData.themeQuery.error ? (
                      <Badge tone="critical">Error</Badge>
                    ) : (
                      <Badge>Pending</Badge>
                    )}
                  </InlineStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">GraphQL Query</Text>
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <pre style={{
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'Monaco, Menlo, monospace',
                        margin: 0,
                      }}>
                        {actionData.themeQuery.query}
                      </pre>
                    </Box>
                  </BlockStack>

                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">Response</Text>
                    <Box padding="300" background={actionData.themeQuery.error ? "bg-surface-critical" : "bg-surface-success"} borderRadius="200">
                      <pre style={{
                        fontSize: '11px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'Monaco, Menlo, monospace',
                        margin: 0,
                        maxHeight: '300px',
                        overflow: 'auto',
                      }}>
                        {JSON.stringify(actionData.themeQuery.response, null, 2)}
                      </pre>
                    </Box>
                  </BlockStack>

                  {actionData.themeQuery.error && (
                    <Banner tone="critical">
                      <p>{actionData.themeQuery.error}</p>
                    </Banner>
                  )}
                </BlockStack>
              </Box>
            </Card>

            {/* Step 2: Settings Query */}
            {actionData.settingsQuery && (
              <Card>
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">Step 2: Get Theme Settings</Text>
                      {actionData.settingsQuery.settingsData ? (
                        <Badge tone="success">Success</Badge>
                      ) : actionData.settingsQuery.error ? (
                        <Badge tone="critical">Error</Badge>
                      ) : (
                        <Badge>Pending</Badge>
                      )}
                    </InlineStack>

                    <Divider />

                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">GraphQL Query</Text>
                      <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                        <pre style={{
                          fontSize: '12px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'Monaco, Menlo, monospace',
                          margin: 0,
                        }}>
                          {actionData.settingsQuery.query}
                        </pre>
                      </Box>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Variables: {`{ "themeId": "${actionData.themeQuery.mainTheme?.id}" }`}
                      </Text>
                    </BlockStack>

                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">Response (theme metadata)</Text>
                      <Box padding="300" background={actionData.settingsQuery.error ? "bg-surface-critical" : "bg-surface-success"} borderRadius="200">
                        <pre style={{
                          fontSize: '11px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'Monaco, Menlo, monospace',
                          margin: 0,
                          maxHeight: '200px',
                          overflow: 'auto',
                        }}>
                          {JSON.stringify({
                            data: {
                              theme: {
                                id: actionData.settingsQuery.response?.data?.theme?.id,
                                name: actionData.settingsQuery.response?.data?.theme?.name,
                                files: {
                                  nodes: actionData.settingsQuery.response?.data?.theme?.files?.nodes?.map((n: any) => ({
                                    filename: n.filename,
                                    body: { content: "[JSON content - see parsed below]" }
                                  }))
                                }
                              }
                            }
                          }, null, 2)}
                        </pre>
                      </Box>
                    </BlockStack>

                    {/* Always show full response for debugging */}
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">Full Response (for debugging)</Text>
                      <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                        <pre style={{
                          fontSize: '10px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'Monaco, Menlo, monospace',
                          margin: 0,
                          maxHeight: '300px',
                          overflow: 'auto',
                        }}>
                          {JSON.stringify(actionData.settingsQuery.response, null, 2)}
                        </pre>
                      </Box>
                    </BlockStack>

                    {actionData.settingsQuery.error && (
                      <Banner tone="critical">
                        <p>{actionData.settingsQuery.error}</p>
                      </Banner>
                    )}
                  </BlockStack>
                </Box>
              </Card>
            )}

            {/* Step 3: Block Detection */}
            {actionData.detection && (
              <Card>
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">Step 3: Block Detection</Text>
                      {actionData.detection.isEnabled ? (
                        <Badge tone="success">Widget Found & Enabled</Badge>
                      ) : actionData.detection.blocksFound.some(b => b.isOurApp) ? (
                        <Badge tone="warning">Widget Found but Disabled</Badge>
                      ) : (
                        <Badge tone="attention">No Widget Blocks Found</Badge>
                      )}
                    </InlineStack>

                    <Divider />

                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">Detection Logic</Text>
                      <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                        <pre style={{
                          fontSize: '11px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'Monaco, Menlo, monospace',
                          margin: 0,
                        }}>
{`// Looking for blocks with type containing:
// - "rewardspro-theme-extension"
// - "membership_widget"

// Check current.blocks (app embeds at root level)
// Check current.sections[*].blocks (section blocks)

// Block is enabled if:
// - type matches our app
// - disabled !== true`}
                        </pre>
                      </Box>
                    </BlockStack>

                    {actionData.detection.blocksFound.length > 0 ? (
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">
                          Blocks Found ({actionData.detection.blocksFound.length} total, {actionData.detection.blocksFound.filter(b => b.isOurApp).length} matching)
                        </Text>
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <pre style={{
                            fontSize: '11px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily: 'Monaco, Menlo, monospace',
                            margin: 0,
                            maxHeight: '400px',
                            overflow: 'auto',
                          }}>
                            {JSON.stringify(actionData.detection.blocksFound, null, 2)}
                          </pre>
                        </Box>
                      </BlockStack>
                    ) : (
                      <Banner tone="warning">
                        <p>
                          No app blocks found in theme settings. The widget may not be installed or
                          the theme may not support app embeds.
                        </p>
                      </Banner>
                    )}

                    {/* Raw settings_data.json current section */}
                    {actionData.settingsQuery?.settingsData?.current && (
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">Raw settings_data.json (current section)</Text>
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <pre style={{
                            fontSize: '10px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily: 'Monaco, Menlo, monospace',
                            margin: 0,
                            maxHeight: '500px',
                            overflow: 'auto',
                          }}>
                            {JSON.stringify(actionData.settingsQuery.settingsData.current, null, 2)}
                          </pre>
                        </Box>
                      </BlockStack>
                    )}
                  </BlockStack>
                </Box>
              </Card>
            )}
          </>
        )}

        {/* Help Card */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">How Widget Detection Works</Text>
              <Divider />
              <BlockStack gap="300">
                <Text as="p" variant="bodyMd">
                  <strong>1. Get Main Theme:</strong> Query Shopify for the active/main theme using the themes query with MAIN role filter.
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>2. Get Theme Settings:</strong> Fetch the theme's config/settings_data.json file which contains all block configurations.
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>3. Parse Block Data:</strong> Search through the blocks and sections for any block types that match our app extension handle.
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>4. Check Enabled Status:</strong> A block is considered enabled if it exists and the "disabled" flag is not set to true.
                </Text>
              </BlockStack>
              <Divider />
              <Text as="p" variant="bodySm" tone="subdued">
                App extension identifiers searched: "rewardspro-theme-extension", "membership_widget"
              </Text>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
