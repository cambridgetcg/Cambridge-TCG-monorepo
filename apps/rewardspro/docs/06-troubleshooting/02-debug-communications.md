# 🔍 How to See Exact Communications Between App and Shopify

## 🚨 Current Issue: Blank Page
The app is showing a blank page. Here's exactly where to look for communications:

## 1. 🌐 Browser Developer Tools (Most Important)

### Open Chrome DevTools (F12 or right-click → Inspect)

#### A. Network Tab
1. **Open Network tab BEFORE loading the page**
2. **Enable "Preserve log"** (checkbox at top)
3. **Reload the page** (Ctrl+R or Cmd+R)
4. **Look for:**
   - Red requests (failed)
   - 401/403 status codes (authentication failures)
   - Requests to `/auth` endpoints
   - Requests with "shop" or "host" parameters

**What to check:**
```
✓ Is there a request to your app URL?
✓ Does it have ?shop=yourstore.myshopify.com&host=xxx parameters?
✓ Are there any failed requests (red)?
✓ Click on each request → Headers tab → Look for:
  - Authorization header (should have Bearer token)
  - X-Shopify headers
  - Referer (should be from myshopify.com)
```

#### B. Console Tab
```javascript
// Paste this in console to see App Bridge status:
console.log('=== APP BRIDGE STATUS ===');
console.log('Window location:', window.location.href);
console.log('Is embedded:', window.top !== window.self);
console.log('Has Shopify object:', typeof window.shopify);
console.log('Shopify config:', window.shopify?.config);
console.log('Shopify environment:', window.shopify?.environment);
console.log('Document referrer:', document.referrer);
console.log('=========================');
```

#### C. Application Tab
1. Go to **Application** → **Cookies**
2. Check for Shopify session cookies
3. Go to **Application** → **Local Storage**
4. Check for any Shopify-related data

## 2. 🖥️ Vercel Function Logs (Server-Side)

### Access Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Select your project
3. Click **Functions** tab
4. Click **View Function Logs**

**Look for:**
```
================================================================================
[xxxxx] 📥 INCOMING App Route Loader REQUEST
================================================================================
Method: GET
URL: /app?shop=yourstore.myshopify.com
Headers: { ... }
================================================================================

🛍️🛍️🛍️ SHOPIFY CONTEXT 🛍️🛍️🛍️
Shop: yourstore.myshopify.com
Session ID: xxx
Has Access Token: true/false
🛍️🛍️🛍️🛍️🛍️🛍️🛍️🛍️🛍️🛍️

⚠️⚠️⚠️ POTENTIAL AUTHENTICATION ISSUES DETECTED:
⚠️ Missing "shop" parameter in URL
⚠️ No Authorization header found
⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
```

## 3. 🧪 Test Endpoints

### Direct Test (No Embedding)
Open in a new tab:
```
https://your-app.vercel.app/api/test-auth?shop=yourstore.myshopify.com
```

This will show:
- Environment variables status
- Authentication attempt
- Session information

### Health Check
```
https://your-app.vercel.app/api/health
```

## 4. 🗄️ Database Check

### Check Sessions in Database
Run this SQL query in your database:
```sql
SELECT id, shop, "isOnline", expires, 
       CASE WHEN "accessToken" IS NOT NULL THEN 'Present' ELSE 'Missing' END as token_status,
       "createdAt"
FROM "Session"
WHERE shop = 'yourstore.myshopify.com'
ORDER BY "createdAt" DESC
LIMIT 5;
```

## 5. 🔴 Common Communication Issues

### Issue 1: No shop/host parameters
**Symptom:** URL is just `/app` without parameters
**Fix:** App needs to be opened from Shopify Admin

### Issue 2: No session token
**Symptom:** No Authorization header in requests
**Fix:** App Bridge not initialized properly

### Issue 3: CORS/CSP errors
**Symptom:** Console shows Content Security Policy errors
**Fix:** Check frame-ancestors in CSP headers

### Issue 4: 401 Unauthorized
**Symptom:** Server returns 401 status
**Fix:** Session expired or not created

## 6. 📊 Quick Debug Checklist

Run through this checklist:

```
□ Browser Console - Any red errors?
□ Network Tab - Any failed requests?
□ URL has ?shop= parameter?
□ URL has &host= parameter?
□ Referer header from myshopify.com?
□ Authorization header present?
□ Session in database?
□ /api/test-auth endpoint works?
□ Vercel logs show requests?
```

## 7. 🎯 Immediate Actions

1. **Open Chrome DevTools Console** and paste:
```javascript
// Check everything at once
(function debugShopify() {
  console.clear();
  console.log('%c🔍 SHOPIFY APP DEBUG INFO', 'font-size: 20px; color: blue;');
  
  // URL Info
  console.group('📍 URL Information');
  console.log('Full URL:', window.location.href);
  console.log('Shop param:', new URLSearchParams(window.location.search).get('shop'));
  console.log('Host param:', new URLSearchParams(window.location.search).get('host'));
  console.groupEnd();
  
  // Embedding Info
  console.group('🖼️ Embedding Status');
  console.log('Is embedded:', window.top !== window.self);
  console.log('Referrer:', document.referrer);
  console.log('Parent origin:', window.parent.location.origin);
  console.groupEnd();
  
  // App Bridge Info
  console.group('🌉 App Bridge Status');
  console.log('Has Shopify object:', typeof window.shopify !== 'undefined');
  if (window.shopify) {
    console.log('Config:', window.shopify.config);
    console.log('Environment:', window.shopify.environment);
    console.log('Loading:', window.shopify.loading);
  }
  console.groupEnd();
  
  // Check for errors
  console.group('❌ Error Check');
  const errors = [];
  if (!new URLSearchParams(window.location.search).get('shop')) errors.push('Missing shop parameter');
  if (!new URLSearchParams(window.location.search).get('host')) errors.push('Missing host parameter');
  if (typeof window.shopify === 'undefined') errors.push('App Bridge not loaded');
  if (window.top === window.self) errors.push('Not in iframe (not embedded)');
  
  if (errors.length > 0) {
    console.error('Issues found:', errors);
  } else {
    console.log('✅ No obvious issues detected');
  }
  console.groupEnd();
})();
```

2. **Check Network Tab** for failed requests

3. **Check Vercel Logs** at https://vercel.com/dashboard → Functions → Logs

4. **Test direct access**: 
   ```
   https://your-app.vercel.app/api/test-auth?shop=yourstore.myshopify.com
   ```

## 8. 📝 What to Report

When you find the issue, note:
1. **Exact error message** from console
2. **Failed request URL** from Network tab
3. **Missing parameters** (shop, host, token)
4. **Vercel error logs**
5. **Database session status**

This will pinpoint exactly where the communication is breaking!