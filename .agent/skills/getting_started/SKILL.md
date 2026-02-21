---
name: getting_started
description: How to set up and run the Brain app locally for development.
---

# Getting Started

Follow these steps to get the Brain app running locally for development.

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Environment Variables

Create a `.env.local` file in the project root with the required keys:

```bash
# Required
JWT_SECRET=<generated-secret>
GOOGLE_API_KEY=<your-google-api-key>
```

### Generating JWT_SECRET

Generate a random secret using OpenSSL:

```bash
openssl rand -base64 32
```

Copy the output and use it as the `JWT_SECRET` value.

### Getting GOOGLE_API_KEY

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key
3. Copy and paste it as the `GOOGLE_API_KEY` value

## Step 3: Create a User

The app requires at least one user to log in. Create one using the built-in script:

```bash
npx tsx scripts/create-user.ts <email> <password>
```

For example:

```bash
npx tsx scripts/create-user.ts hello@user.com password
```

## Step 4: Start the Dev Server

> **Important:** Do NOT run this command via a tool or script. Ask the user to run it manually in their own terminal, as it starts a long-running process that should remain under the user's control.

Ask the user to open a terminal and run:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`. Log in with the user you created in Step 3.

## Step 5: Enabling Additional Google Cloud APIs

The API key from AI Studio works for Gemini (Generative Language API) out of the box. To enable location, weather, and maps features, you need to activate additional APIs on the same Google Cloud project:

1. Find the Google Cloud project linked to your API key:
   - In [Google AI Studio](https://aistudio.google.com/apikey), note the project name shown next to your key
2. Go to [Google Cloud API Library](https://console.cloud.google.com/apis/library) and select that project
3. Search for and enable each of the following APIs:
   - **Air Quality API** — air quality data for location-based features
   - **Places API (New)** — place search and details
   - **Routes API** — directions and distance calculations
   - **Weather API** — weather data for location-based features
4. For each API, click on it and press **Enable**

No extra keys are needed — the same `GOOGLE_API_KEY` is used for all of these. However, you need to add the enabled APIs to your key's restrictions:

5. Go to [Google Cloud API Credentials](https://console.cloud.google.com/apis/credentials)
6. Click on your API key
7. Under **API restrictions**, add the newly enabled APIs to the allowed list
8. Save the changes

## Optional Environment Variables

These keys enable additional features. The app works without them, but the corresponding features will be disabled.

Add any of these to your `.env.local` file:

```bash
# xAI (Grok models) - adds Grok as an alternative AI model
# Get a key from: https://console.x.ai/
XAI_API_KEY=<your-xai-api-key>

# Brave Search - enables web search, news search, and image search tools
# Get a key from: https://brave.com/search/api/
BRAVE_API_KEY=<your-brave-api-key>

# Tavily - enables premium web search and URL content reading tools
# Get a key from: https://tavily.com/
TAVILY_API_KEY=<your-tavily-api-key>
```

### What each optional key enables

| Key | Features |
|-----|----------|
| `XAI_API_KEY` | Grok model appears in the model selector |
| `BRAVE_API_KEY` | `internet_search`, `news_search`, `image_search` tools |
| `TAVILY_API_KEY` | `internet_search_premium`, `read_url` tools |

## Step 6: Post-Setup Follow-up

Once the initial setup is complete and the user has the app running, you **MUST** proactively ask the user if they would like to enable the following:

1. **Additional Google Cloud APIs**: Mention that they can enable Air Quality, Places, Routes, and Weather APIs to unlock location-based tools.
2. **Optional Tools**: Ask if they want to integrate search engines (Brave or Tavily) or alternative AI providers like Grok.
3. **Multi-AI Group Chat**: Explain that these keys unlock features like comparing different AI models in the same thread.

