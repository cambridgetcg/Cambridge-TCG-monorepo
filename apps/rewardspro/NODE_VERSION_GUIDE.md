# Node.js Version 20 Setup Guide

## Current Configuration
- **Required Node Version**: 20.x
- **Current Version**: v22.14.0

## Files Updated
1. **package.json** - Added `"engines": { "node": "20.x" }`
2. **.nvmrc** - Created with `20`

## How to Switch to Node 20

### Option 1: Using NVM (Node Version Manager)
```bash
# Install Node 20 if not already installed
nvm install 20

# Use Node 20 for this project
nvm use 20

# Or simply run (will read from .nvmrc)
nvm use

# Verify the version
node --version
# Should show: v20.x.x
```

### Option 2: Using fnm (Fast Node Manager)
```bash
# Install Node 20
fnm install 20

# Use Node 20
fnm use 20

# Verify
node --version
```

### Option 3: Using Volta
```bash
# Pin Node 20 to this project
volta pin node@20

# Verify
node --version
```

## After Switching to Node 20

1. **Clear node_modules and reinstall**:
```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

2. **Rebuild the project**:
```bash
npm run build
```

3. **Test locally**:
```bash
npm run dev
```

## Vercel Deployment
Vercel will automatically detect and use Node 20 from:
- The `engines` field in package.json
- The .nvmrc file

No additional configuration needed for Vercel.

## Why Node 20?
- **LTS Version**: Node 20 is the current LTS (Long Term Support) version
- **Stability**: More stable than Node 22 which is still in active development
- **Compatibility**: Better compatibility with Shopify and Remix packages
- **Vercel Support**: Full support on Vercel platform

## Troubleshooting

If you encounter issues after switching:

1. **Clear all caches**:
```bash
rm -rf node_modules .cache build
npm cache clean --force
```

2. **Reinstall dependencies**:
```bash
npm install --legacy-peer-deps
```

3. **Check Node version in terminal**:
```bash
which node
node --version
```

Make sure you're using Node 20.x before running any npm commands.