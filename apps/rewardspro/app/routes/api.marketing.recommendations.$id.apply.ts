import { json, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { AnalyticsRecommendationsService } from "~/services/analytics-recommendations.server";
import prisma from "~/db.server";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/marketing/recommendations/:id/apply
 * Transform a recommendation into a draft campaign
 *
 * This endpoint ensures idempotency - if called multiple times with the same
 * recommendation ID, it will return the existing campaign rather than creating duplicates
 */
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const recommendationId = params.id;

  if (!recommendationId) {
    return json({
      success: false,
      message: "Recommendation ID is required"
    }, { status: 400 });
  }

  try {
    const recommendationsService = new AnalyticsRecommendationsService(shop);

    // Get the recommendation
    const recommendation = await recommendationsService.getRecommendationById(recommendationId);

    if (!recommendation) {
      return json({
        success: false,
        message: "Recommendation not found"
      }, { status: 404 });
    }

    // Check if this recommendation was already applied
    if (recommendation.status === 'applied' && recommendation.appliedAt) {
      // Try to find the existing campaign
      const existingCampaign = await prisma.emailCampaign.findFirst({
        where: {
          shop,
          createdAt: {
            gte: new Date(recommendation.appliedAt.getTime() - 60000), // Within 1 minute
            lte: new Date(recommendation.appliedAt.getTime() + 60000)
          }
        }
      });

      if (existingCampaign) {
        return json({
          success: true,
          message: "Campaign already exists",
          campaignId: existingCampaign.id,
          isExisting: true
        });
      }
    }

    // Transform the recommendation to campaign data
    const campaignData = await recommendationsService.transformToCampaign(recommendationId);

    // Create the email template
    const template = await prisma.emailTemplate.create({
      data: {
        id: uuidv4(),
        shop,
        name: `${campaignData.name} Template`,
        type: campaignData.type || 'promotional',
        subject: campaignData.subject,
        previewText: campaignData.previewText || '',
        bodyHtml: campaignData.bodyHtml || '<p>Email content here...</p>',
        bodyText: campaignData.bodyHtml?.replace(/<[^>]*>/g, '') || 'Email content here...',
        isActive: true,
        variables: {
          customer_name: '{{customer_name}}',
          tier_name: '{{tier_name}}',
          store_credit: '{{store_credit}}',
          shop_name: '{{shop_name}}'
        }
      }
    });

    // Create the campaign
    const campaign = await prisma.emailCampaign.create({
      data: {
        id: uuidv4(),
        shop,
        name: campaignData.name,
        templateId: template.id,
        status: campaignData.status || 'draft',
        segmentRules: campaignData.segmentCriteria || {},
        targetCustomerIds: campaignData.targetCustomerIds || [],
        metadata: {
          ...campaignData.metadata,
          recommendationId,
          estimatedRevenue: campaignData.estimatedRevenue
        },
        metrics: {
          estimatedRecipients: campaignData.metadata?.affectedCount || 0,
          estimatedRevenue: campaignData.estimatedRevenue || 0
        }
      }
    });

    return json({
      success: true,
      message: "Campaign created successfully",
      campaignId: campaign.id,
      templateId: template.id,
      isExisting: false
    });

  } catch (error: any) {
    console.error('[API] Error applying recommendation:', error);

    return json({
      success: false,
      message: error.message || "Failed to apply recommendation"
    }, { status: 500 });
  }
};