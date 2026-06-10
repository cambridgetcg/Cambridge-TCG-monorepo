#!/bin/bash

# Debug Helpers - Common debugging commands for RewardsPro

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔧 RewardsPro Debug Helpers"
echo "=========================="

# Function to check TypeScript errors
check_typescript() {
    echo -e "${YELLOW}Checking TypeScript compilation...${NC}"
    DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx tsc --noEmit
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ TypeScript compilation successful${NC}"
    else
        echo -e "${RED}❌ TypeScript compilation failed${NC}"
    fi
}

# Function to find deprecated Polaris icons
find_deprecated_icons() {
    echo -e "${YELLOW}Searching for potentially deprecated icons...${NC}"
    grep -r "Icon>" app/ | grep -E "(TrendingUp|Download|CircleDot|BillingStatement)" | head -20
}

# Function to check import paths
check_imports() {
    echo -e "${YELLOW}Checking for tilde imports...${NC}"
    grep -r "from ['\"]~/" app/routes/ | head -20
}

# Function to list available Polaris icons
list_polaris_icons() {
    echo -e "${YELLOW}Available Polaris icons:${NC}"
    ls node_modules/@shopify/polaris-icons/dist/svg/*.svg | sed 's/.*\///' | sed 's/.svg//' | head -30
}

# Function to validate environment
validate_env() {
    echo -e "${YELLOW}Environment Check:${NC}"
    echo "Node version: $(node -v)"
    echo "NPM version: $(npm -v)"
    echo "TypeScript version: $(npx tsc -v)"

    if [ -f .env ]; then
        echo -e "${GREEN}✅ .env file exists${NC}"
    else
        echo -e "${RED}❌ .env file missing${NC}"
    fi

    if [ -d node_modules ]; then
        echo -e "${GREEN}✅ node_modules exists${NC}"
    else
        echo -e "${RED}❌ node_modules missing - run npm install${NC}"
    fi
}

# Function to quick build test
quick_build() {
    echo -e "${YELLOW}Running quick build test...${NC}"
    DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm run build
}

# Function to check for common issues
check_common_issues() {
    echo -e "${YELLOW}Checking for common issues...${NC}"

    # Check for missing 'as' prop on Text components
    echo "Checking for missing 'as' prop on Text components:"
    grep -r "<Text" app/ | grep -v "as=" | head -5

    # Check for deprecated Card.Section
    echo "Checking for deprecated Card.Section:"
    grep -r "Card.Section" app/ | head -5

    # Check for incorrect icon props
    echo "Checking for icon children in Buttons:"
    grep -r "<Button.*>" app/ | grep -A1 -B1 "Icon" | head -10
}

# Function to create new debug session
new_debug_session() {
    if [ -z "$1" ]; then
        echo "Usage: new_debug_session <issue-name>"
        return 1
    fi

    DATE=$(date +%Y-%m-%d)
    FILENAME="debug-sessions/active/${DATE}-${1}.md"

    cp debug-sessions/templates/debug-template.md "$FILENAME"
    echo -e "${GREEN}✅ Created new debug session: $FILENAME${NC}"
}

# Menu
echo ""
echo "Available commands:"
echo "1) check_typescript    - Check TypeScript compilation"
echo "2) find_deprecated_icons - Find potentially deprecated icons"
echo "3) check_imports       - Check for tilde imports"
echo "4) list_polaris_icons  - List available Polaris icons"
echo "5) validate_env        - Validate environment setup"
echo "6) quick_build         - Run a quick build test"
echo "7) check_common_issues - Check for common issues"
echo "8) new_debug_session   - Create new debug session"
echo ""
echo "Run any command by typing its name, e.g.: check_typescript"