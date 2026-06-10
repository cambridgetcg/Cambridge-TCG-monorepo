/**
 * Server-side device detection utilities
 * Enables responsive data loading at the server level
 */

export interface DeviceInfo {
  type: "mobile" | "tablet" | "desktop";
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  viewport: {
    width: number;
    height: number;
  };
}

// Parse user agent for device detection
export function detectDevice(request: Request): DeviceInfo {
  const userAgent = request.headers.get("user-agent") || "";
  
  // Mobile detection patterns
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const tabletRegex = /iPad|Android.*Tablet|Tablet.*Android|Kindle|Silk/i;
  
  const isMobile = mobileRegex.test(userAgent) && !tabletRegex.test(userAgent);
  const isTablet = tabletRegex.test(userAgent);
  const isDesktop = !isMobile && !isTablet;
  
  // Estimate viewport based on device type
  let viewport = { width: 1920, height: 1080 }; // Desktop default
  
  if (isMobile) {
    viewport = { width: 375, height: 667 }; // iPhone default
  } else if (isTablet) {
    viewport = { width: 768, height: 1024 }; // iPad default
  }
  
  // Check for viewport hints in headers
  const viewportWidth = request.headers.get("viewport-width");
  const viewportHeight = request.headers.get("viewport-height");
  
  if (viewportWidth && viewportHeight) {
    viewport = {
      width: parseInt(viewportWidth, 10),
      height: parseInt(viewportHeight, 10),
    };
  }
  
  return {
    type: isMobile ? "mobile" : isTablet ? "tablet" : "desktop",
    isMobile,
    isTablet,
    isDesktop,
    viewport,
  };
}

// Get responsive data limits based on device
export function getDataLimits(device: DeviceInfo) {
  if (device.isMobile) {
    return {
      itemsPerPage: 10,
      imageSize: 300,
      preloadImages: 2,
      enableAnimations: false,
    };
  }
  
  if (device.isTablet) {
    return {
      itemsPerPage: 20,
      imageSize: 600,
      preloadImages: 4,
      enableAnimations: true,
    };
  }
  
  // Desktop
  return {
    itemsPerPage: 50,
    imageSize: 1200,
    preloadImages: 6,
    enableAnimations: true,
  };
}

// Generate responsive image URLs for Shopify CDN
export function generateResponsiveImageUrl(
  baseUrl: string,
  device: DeviceInfo
): string {
  const width = device.isMobile ? 600 : device.isTablet ? 900 : 1200;
  
  // Shopify CDN transformation
  if (baseUrl.includes("cdn.shopify.com")) {
    return `${baseUrl}?width=${width}&format=webp`;
  }
  
  return baseUrl;
}

// Get responsive grid columns based on device
export function getResponsiveGridColumns(device: DeviceInfo) {
  if (device.isMobile) {
    return { xs: "1fr" };
  }
  
  if (device.isTablet) {
    return { xs: "1fr", md: "1fr 1fr" };
  }
  
  return { xs: "1fr", md: "1fr 1fr", lg: "1fr 1fr 1fr" };
}

// Determine if feature should be enabled based on device
export function shouldEnableFeature(
  feature: string,
  device: DeviceInfo
): boolean {
  const mobileDisabledFeatures = [
    "complex-animations",
    "hover-effects",
    "parallax",
    "video-backgrounds",
  ];
  
  const tabletDisabledFeatures = [
    "parallax",
    "video-backgrounds",
  ];
  
  if (device.isMobile && mobileDisabledFeatures.includes(feature)) {
    return false;
  }
  
  if (device.isTablet && tabletDisabledFeatures.includes(feature)) {
    return false;
  }
  
  return true;
}