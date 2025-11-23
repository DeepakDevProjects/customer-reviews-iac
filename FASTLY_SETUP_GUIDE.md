# Fastly CDN Setup Guide for ESI (Edge Side Includes)

## What We've Built So Far

✅ **Lambda Function** - Generates HTML fragments (`product-a.html`, `product-b.html`) every 1 hour  
✅ **Main HTML Page** - `index.html` with ESI includes that references the fragments  
✅ **S3 Bucket** - Stores all HTML files with public read access  
✅ **EventBridge** - Triggers Lambda every 1 hour to update reviews  

## What's Next: Fastly CDN Setup

Fastly will:
1. Serve the main `index.html` page
2. Process ESI tags (`<esi:include>`) 
3. Fetch fragments from S3 and compose them into one page
4. Cache the composed page for fast delivery

---

## Step-by-Step Fastly Setup

### Step 1: Create Fastly Account (Free Tier)

1. **Go to:** https://www.fastly.com/signup
2. **Sign up** for free account (no credit card required for trial)
3. **Verify email** and log in

**Fastly Free Tier Includes:**
- 50GB data transfer/month
- ESI processing enabled
- Free SSL certificate
- Global CDN network

---

### Step 2: Create a New Service

1. **Log in to Fastly Dashboard:** https://manage.fastly.com/
2. **Click:** "Create a service" or "Add service"
3. **Service name:** `customer-reviews-cdn` (or any name you prefer)
4. **Click:** "Create"

---

### Step 3: Add Origin (S3 Bucket)

**What is an Origin?**  
The origin is where Fastly fetches your content from. In our case, it's the S3 bucket.

1. **In your Fastly service, click:** "Origins" tab
2. **Click:** "Create host"
3. **Fill in:**
   - **Name:** `s3-origin` (or any name)
   - **Address:** `{YOUR_BUCKET_NAME}.s3.us-east-1.amazonaws.com`
     - Example: `customer-reviews-fragments-pr-main-c3f3fe6-014125596611.s3.us-east-1.amazonaws.com`
   - **Port:** `443` (HTTPS)
   - **SSL SNI hostname:** Same as Address
   - **Override host:** Leave empty
4. **Click:** "Create"

**How to find your bucket name:**
- AWS Console → CloudFormation → Your Stack → Outputs tab → `ReviewsBucketName`
- Or: AWS Console → S3 → Your bucket name

---

### Step 4: Enable ESI Processing

**ESI (Edge Side Includes)** allows Fastly to process `<esi:include>` tags and fetch fragments.

1. **In Fastly service, go to:** "Configuration" tab
2. **Click:** "Edit configuration" (or "Clone" to create new version)
3. **Go to:** "Settings" section
4. **Find:** "ESI" or "Edge Side Includes"
5. **Enable:** "Process ESI" or "Enable ESI processing"
6. **Save** the configuration
7. **Click:** "Activate" to deploy the changes

**Note:** ESI processing is usually enabled by default in Fastly, but verify it's on.

---

### Step 5: Configure VCL (Varnish Configuration Language) - Optional but Recommended

Fastly uses VCL to customize how requests are handled. We'll add a rule to:
- Serve `index.html` as the default page
- Ensure ESI includes work correctly

1. **In Fastly service, go to:** "Configuration" → "VCL snippets" or "Custom VCL"
2. **Add this snippet** (or modify existing):

```vcl
# Set default backend (origin)
backend s3_origin {
    .host = "{YOUR_BUCKET_NAME}.s3.us-east-1.amazonaws.com";
    .port = "443";
    .ssl = true;
    .ssl_sni_hostname = "{YOUR_BUCKET_NAME}.s3.us-east-1.amazonaws.com";
}

# Handle requests
sub vcl_recv {
    # If root path, serve index.html
    if (req.url == "/" || req.url == "") {
        set req.url = "/index.html";
    }
    
    # Set backend
    set req.backend = s3_origin;
    
    return (pass);
}

# Enable ESI processing
sub vcl_fetch {
    # Enable ESI for HTML files
    if (beresp.http.Content-Type ~ "text/html") {
        set beresp.do_esi = true;
    }
}
```

3. **Replace** `{YOUR_BUCKET_NAME}` with your actual bucket name
4. **Save** and **Activate**

**Note:** If you used the "Origins" UI (Step 3), Fastly may have auto-generated VCL. You can modify it or add snippets.

---

### Step 6: Get Your Fastly Service URL

1. **In Fastly service, go to:** "Settings" or "Info" tab
2. **Find:** "Service URL" or "Hostname"
3. **Copy** the URL (looks like: `xxxxx.global.ssl.fastly.net`)

**This is your CDN URL!**  
Example: `https://your-service-name.global.ssl.fastly.net/`

---

### Step 7: Test Your Setup

1. **Open browser** and go to your Fastly URL:
   ```
   https://your-service-name.global.ssl.fastly.net/
   ```
   or
   ```
   https://your-service-name.global.ssl.fastly.net/index.html
   ```

2. **What you should see:**
   - Beautiful header: "🌟 Customer Reviews"
   - Product A reviews section
   - Product B reviews section
   - Footer with last updated time

3. **Verify ESI is working:**
   - **View page source** (Right-click → View Page Source)
   - **You should NOT see** `<esi:include>` tags (they should be replaced with actual HTML)
   - **You should see** the actual review content from both fragments

---

## Troubleshooting

### Problem: I see `<esi:include>` tags in the page

**Solution:**
- ESI processing is not enabled
- Go to Fastly → Configuration → Settings → Enable ESI
- Activate the configuration

### Problem: I see "404 Not Found" or blank page

**Solution:**
- Check that `index.html` exists in your S3 bucket
- Verify S3 bucket name in Fastly origin configuration
- Check S3 bucket has public read access
- Try accessing S3 directly: `https://{bucket}.s3.us-east-1.amazonaws.com/index.html`

### Problem: Fragments are not loading

**Solution:**
- Check S3 URLs in `index.html` (view source in browser)
- Verify fragments exist: `https://{bucket}.s3.us-east-1.amazonaws.com/reviews/product-a.html`
- Check CORS settings on S3 bucket (should allow `*` origin)
- Verify Fastly can reach S3 (check Fastly logs)

### Problem: Content is outdated

**Solution:**
- Fastly caches content for performance
- To see latest: Clear Fastly cache or wait for cache TTL
- Or: Use cache-busting query parameter: `?v=123`

---

## How It All Works Together

```
┌─────────────────┐
│  EventBridge    │  Every 1 hour
│  (Cron Job)     │  ──────────────┐
└─────────────────┘                │
                                    ▼
┌─────────────────────────────────────────────┐
│  Lambda Function                             │
│  1. Fetches reviews from Mock API            │
│  2. Renders product-a.html                   │
│  3. Renders product-b.html                   │
│  4. Renders index.html (with ESI tags)       │
│  5. Uploads all to S3                        │
└─────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────┐
│  S3 Bucket                                   │
│  ├── index.html (main page with ESI)        │
│  ├── reviews/product-a.html                 │
│  └── reviews/product-b.html                 │
└─────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────┐
│  Fastly CDN                                  │
│  1. Receives request for /                  │
│  2. Fetches index.html from S3               │
│  3. Processes <esi:include> tags            │
│  4. Fetches product-a.html                  │
│  5. Fetches product-b.html                  │
│  6. Composes final HTML                      │
│  7. Serves to user                          │
└─────────────────────────────────────────────┘
                                    │
                                    ▼
                            ┌───────────────┐
                            │   User's      │
                            │   Browser     │
                            └───────────────┘
```

---

## Next Steps After Fastly Setup

1. ✅ **Test the composed page** - Verify both product reviews appear
2. ✅ **Check page source** - Confirm ESI tags are processed
3. ✅ **Monitor Fastly dashboard** - Check request/response stats
4. ✅ **Optional:** Set up custom domain (if needed)
5. ✅ **Optional:** Configure cache TTL for better performance

---

## Quick Reference: Important URLs

After setup, you'll have:

- **S3 Direct URLs:**
  - Main page: `https://{bucket}.s3.us-east-1.amazonaws.com/index.html`
  - Product A: `https://{bucket}.s3.us-east-1.amazonaws.com/reviews/product-a.html`
  - Product B: `https://{bucket}.s3.us-east-1.amazonaws.com/reviews/product-b.html`

- **Fastly CDN URL:**
  - Composed page: `https://{service-name}.global.ssl.fastly.net/`

- **Find these in AWS:**
  - CloudFormation → Your Stack → Outputs tab

---

## Summary

You've successfully set up:
- ✅ Server-side rendering using ESI
- ✅ CDN for fast global delivery
- ✅ Automated content updates every 1 hour
- ✅ Composed HTML page from multiple fragments

**Congratulations!** 🎉 You've built a complete server-side rendered application using AWS Lambda, S3, EventBridge, and Fastly CDN!

