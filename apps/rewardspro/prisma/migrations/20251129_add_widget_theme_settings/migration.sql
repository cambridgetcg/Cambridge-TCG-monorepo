-- CreateEnum
CREATE TYPE "WidgetThemeMode" AS ENUM ('LIGHT', 'DARK', 'CUSTOM');

-- AlterTable: Add widget theme settings to ShopSettings
ALTER TABLE "ShopSettings"
ADD COLUMN "widgetThemeMode" "WidgetThemeMode" NOT NULL DEFAULT 'LIGHT',
ADD COLUMN "widgetPrimaryColor" TEXT DEFAULT '#5C6AC4',
ADD COLUMN "widgetBackgroundColor" TEXT DEFAULT '#FFFFFF',
ADD COLUMN "widgetTextColor" TEXT DEFAULT '#212B36',
ADD COLUMN "widgetAccentColor" TEXT DEFAULT '#008060',
ADD COLUMN "widgetBorderRadius" INTEGER DEFAULT 12,
ADD COLUMN "widgetFontFamily" TEXT DEFAULT 'inherit';
