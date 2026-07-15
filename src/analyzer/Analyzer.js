const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class Analyzer {
  constructor() {
    // Clients are lazily initialized so the server can boot without API keys.
    this._openai = null;
    this._gemini = null;
  }

  get _usesOpenRouter() {
    return !!process.env.OPENROUTER_API_KEY;
  }

  get openai() {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('No LLM key configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY in your .env file.');
    }
    if (!this._openai) {
      // OpenRouter is OpenAI-compatible — just point the SDK at its base URL.
      this._openai = new OpenAI(
        this._usesOpenRouter
          ? { apiKey, baseURL: 'https://openrouter.ai/api/v1' }
          : { apiKey }
      );
    }
    return this._openai;
  }

  get model() {
    if (this._usesOpenRouter) {
      // Free keys only access ":free" models.
      return process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
    }
    return process.env.OPENAI_MODEL || 'gpt-4';
  }

  get gemini() {
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured. Add it to your .env file.');
    }
    if (!this._gemini) {
      this._gemini = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
    }
    return this._gemini;
  }

  async analyzeCode(code, analysisType, language = 'javascript') {
    const jsonOnly = '\n\nIMPORTANT: Respond with ONLY a single raw JSON object. ' +
      'No markdown code fences, no prose, no commentary before or after the JSON.';

    const prompts = {
      performance: this.getPerformancePrompt(language) + jsonOnly,
      bugs: this.getBugPrompt(language) + jsonOnly,
      security: this.getSecurityPrompt(language) + jsonOnly
    };

    try {
      let raw;
      if (analysisType === 'security') {
        // Gemini uses a separate SDK; keep it in its own branch scope.
        const geminiModel = this.gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });
        const geminiResponse = await geminiModel.generateContent(prompts.security + code);
        raw = geminiResponse.response.text();
      } else {
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: prompts[analysisType] + code }],
          temperature: analysisType === 'bugs' ? 0.2 : 0.1,
          max_tokens: 2000
        });
        raw = completion.choices[0].message.content;
      }

      return this.parseAnalysisResult(raw);
    } catch (error) {
      console.error('Analysis failed:', error);
      throw new Error('Failed to analyze code: ' + error.message);
    }
  }

  getPerformancePrompt(language) {
    return `You are a senior software architect. Analyze the following ${language} code for performance bottlenecks and optimization opportunities.

Return JSON:
{
  "issues": [
    {
      "type": "performance",
      "severity": "high|medium|low",
      "file": "filename.js",
      "line": 123,
      "message": "Specific performance issue description",
      "suggestion": "How to fix/optimize",
      "complexity": "O(n), O(n²), constant, etc.",
      "impact": "Brief impact description if fixed"
    }
  ],
  "summary": "Brief summary of performance findings"
}

Focus on:
- Time complexity (Big O)
- Memory usage patterns
- Inefficient loops or nested iterations
- Database query issues
- Caching opportunities
- I/O operations
- Algorithmic inefficiencies

Code: ${language}:
`;
  }

  getBugPrompt(language) {
    return `You are a security-focused development expert. Analyze this ${language} code for bugs and vulnerabilities.

Return JSON:
{
  "issues": [
    {
      "type": "bug|error|vulnerability",
      "severity": "critical|high|medium|low",
      "file": "filename.js",
      "line": 123,
      "message": "Specific bug description",
      "suggestion": "How to fix or work around",
      "affected_condition": "Description of when bug occurs",
      "test_snippet": "Example code that triggers the bug"
    }
  ],
  "summary": "Brief summary of bugs found"
}

Look for:
- Null pointer/refs exceptions
- Race conditions
- SQL injection/vector injection
- Buffer overflows/underruns
- Type mismatches
- Edge cases
- Division by zero
- String/UTF encoding issues

Code: ${language}:
`;
  }

  getSecurityPrompt(language) {
    return `You are a security researcher. Analyze this ${language} code for security vulnerabilities and attack vectors.

Return JSON:
{
  "issues": [
    {
      "type": "injection|authentication|authorization|crypto|network",
      "severity": "critical|high|medium|low",
      "file": "filename.js",
      "line": 123,
      "vulnerability": "Specific vulnerability type",
      "risk_level": "Low|Medium|High|Critical",
      "affected_function": "Function that contains vulnerability",
      "mitigation": "How to fix the vulnerability",
      "example_attack": "Brief description of how this could be exploited"
    }
  ],
  "summary": "Brief summary of security findings"
}

Identify:
- SQL/NoSQL injection
- Command injection
- XSS/CSRF issues
- Insecure authentication
- Broken authorization
- Weak cryptography
- Insecure deserialization
- Sensitive data exposure
- Security misconfigurations
- Improper error handling

Code: ${language}:
`;
  }

  parseAnalysisResult(result) {
    if (typeof result !== 'string') {
      return { issues: [], summary: 'LLM returned no content' };
    }

    let jsonStr = result.trim();

    // 1) Strip a fenced code block (``` or ```json ... ```).
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();

    // 2) Fallback: extract the outermost balanced { ... } object, in case the
    //    model wrapped the JSON in explanatory prose.
    if (!jsonStr.startsWith('{')) {
      const obj = jsonStr.match(/\{[\s\S]*\}/);
      if (obj) jsonStr = obj[0];
    }

    try {
      return JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse analysis result:', parseError.message);
      return {
        issues: [],
        summary: 'Unable to parse AI analysis response'
      };
    }
  }
}

module.exports = Analyzer;