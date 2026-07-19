export const SETUP_INSTRUCTIONS: Record<string, {
  dashboardUrl: string;
  freeTier: string;
  rateLimits: string;
  howToGet: string;
}> = {
  google: {
    dashboardUrl: 'https://aistudio.google.com/',
    freeTier: 'Yes, generous free tier for Gemini Flash, Pro, and Flash-Lite models.',
    rateLimits: '15 RPM / 1.5M TPM (Flash), 2 RPM / 32k TPM (Pro) under free tier.',
    howToGet: 'Go to Google AI Studio, sign in with your Google account, and click "Get API key".',
  },
  vertex: {
    dashboardUrl: 'https://console.cloud.google.com/vertex-ai',
    freeTier: 'No free tier. Billed directly to your Google Cloud Project Project.',
    rateLimits: 'Determined by your GCP project quota limits.',
    howToGet: 'Create a Service Account in your GCP console, grant it the "Vertex AI User" role, create a JSON private key, and paste the entire JSON file content here.',
  },
  anthropic: {
    dashboardUrl: 'https://console.anthropic.com/',
    freeTier: 'No free tier, but new accounts sometimes receive $5 of trial credit.',
    rateLimits: 'Varies by tier. Tier 1 starts at 50 RPM / 20k TPM.',
    howToGet: 'Log in to the Anthropic Console, navigate to API Keys, and generate a new key.',
  },
  openai: {
    dashboardUrl: 'https://platform.openai.com/api-keys',
    freeTier: 'No free tier, requires a funded developer account.',
    rateLimits: 'Varies by tier. Tier 1 starts at 500 RPM / 20k TPM.',
    howToGet: 'Go to OpenAI Developer Platform, navigate to API Keys, and click "Create new secret key".',
  },
  groq: {
    dashboardUrl: 'https://console.groq.com/keys',
    freeTier: 'Yes, free tier is standard with requests per minute limits.',
    rateLimits: 'Varies per model. Typically 30 RPM / 14,400 RPD for large models.',
    howToGet: 'Create an account on the Groq Console, navigate to API Keys, and generate a key.',
  },
  mistral: {
    dashboardUrl: 'https://console.mistral.ai/api-keys/',
    freeTier: 'Free trial credits on sign up, then pay-as-you-go.',
    rateLimits: 'Starts at 5 requests/sec for trial tiers.',
    howToGet: 'Log in to Mistral Console, go to API Keys, and create a new key.',
  },
  openrouter: {
    dashboardUrl: 'https://openrouter.ai/keys',
    freeTier: 'Provides access to both free open-source models and premium models.',
    rateLimits: 'Varies depending on model and account credits.',
    howToGet: 'Go to OpenRouter, sign in, go to API keys under Settings, and create a key.',
  },
  xai: {
    dashboardUrl: 'https://console.x.ai/',
    freeTier: 'No free tier. Requires adding payment details.',
    rateLimits: 'Standard developer rate limits apply.',
    howToGet: 'Go to xAI Console, generate a new API key, and configure billing.',
  },
  deepseek: {
    dashboardUrl: 'https://platform.deepseek.com/api_keys',
    freeTier: 'No free tier, but extremely low pricing (under $0.30 per 1M tokens).',
    rateLimits: 'Standard limits are very generous.',
    howToGet: 'Create a DeepSeek account, go to API Keys in the developer dashboard, and create a key.',
  },
  iamhc: {
    dashboardUrl: 'https://api.iamhc.cn/',
    freeTier: 'Paid proxy service — aggregated pricing across 25+ models.',
    rateLimits: 'Varies by plan. Contact provider for details.',
    howToGet: 'Visit api.iamhc.cn, register an account, and generate an API key from your dashboard.',
  },
};
