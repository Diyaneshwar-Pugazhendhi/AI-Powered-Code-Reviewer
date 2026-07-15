const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class Analyzer {
  constructor() {
    // Clients are lazily initialized so the server can boot without API keys.
    this._openai = null;
    this._gemini = null;
  }

  get openai() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured. Add it to your .env file.');
    }
    if (!this._openai) {
      this._openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this._openai;
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
    const prompts = {
      performance: this.getPerformancePrompt(language),
      bugs: this.getBugPrompt(language),
      security: this.getSecurityPrompt(language)
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
          model: 'gpt-4',
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

    // Extract the first fenced JSON block, with or without a "json" tag.
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();

    try {
      return JSON.parse(jsonStr);
    } catch (parseError) {
      // Fallback: grab the first balanced { ... } block (handles stray prose).
      const obj = jsonStr.match(/\{[\s\S]*\}/);
      if (obj) {
        try {
          return JSON.parse(obj[0]);
        } catch (_) { /* fall through */ }
      }
      console.error('Failed to parse analysis result:', parseError.message);
      return {
        issues: [],
        summary: 'Unable to parse AI analysis response'
      };
    }
  }
}

module.exports = Analyzer;