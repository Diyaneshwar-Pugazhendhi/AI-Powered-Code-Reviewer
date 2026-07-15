const Analyzer = require('../src/analyzer/Analyzer');

// Mock LLM responses for testing
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                issues: [{
                  type: 'performance',
                  severity: 'high',
                  file: 'test.js',
                  line: 10,
                  message: 'Inefficient loop detected',
                  suggestion: 'Use a hash map for O(1) lookup',
                  complexity: 'O(n²)',
                  impact: 'High with large datasets'
                }],
                summary: 'Found 1 performance issue'
              })
            }
          }]
        })
      }
    }
  }));
});

// Mock Gemini for security analysis
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            issues: [{
              type: 'injection',
              severity: 'critical',
              file: 'test.js',
              line: 1,
              vulnerability: 'Hardcoded credential',
              risk_level: 'Critical',
              mitigation: 'Use environment variables'
            }],
            summary: 'Found 1 security issue'
          })
        }
      })
    })
  }))
}));

describe('AI-Powered Code Reviewer', () => {
  let analyzer;

  beforeAll(() => {
    // Dummy keys so lazy client getters exercise the mocked SDKs
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.GOOGLE_GEMINI_API_KEY = 'test-gemini-key';
  });

  beforeEach(() => {
    analyzer = new Analyzer();
  });

  describe('analyzeCode', () => {
    it('should analyze code for performance issues', async () => {
      const code = `function slowFunction(arr) {
        for(let i = 0; i < arr.length; i++) {
          for(let j = 0; j < arr.length; j++) {
            if(arr[i] === arr[j]) return true;
          }
        }
        return false;
      }`;

      const result = await analyzer.analyzeCode(code, 'performance');

      expect(result).toHaveProperty('issues');
      expect(result.issues[0]).toHaveProperty('type', 'performance');
      expect(result.issues[0]).toHaveProperty('severity');
      expect(result.issues[0]).toHaveProperty('line');
    });

    it('should analyze code for bugs', async () => {
      const code = `function riskyFunction(data) {
        return data.property.value; // Potential null dereference
      }`;

      const result = await analyzer.analyzeCode(code, 'bugs');

      expect(result).toHaveProperty('issues');
    });

    it('should analyze code for security issues', async () => {
      const code = `const password = "admin123"; // Hardcoded credential`;

      const result = await analyzer.analyzeCode(code, 'security');

      expect(result).toHaveProperty('issues');
    });

    it('should handle code without issues gracefully', async () => {
      const code = `function cleanFunction(x) {
        return x * 2;
      }`;

      const result = await analyzer.analyzeCode(code, 'performance');

      expect(result).toHaveProperty('issues');
      expect(result.summary).toBeDefined();
    });

    it('should parse JSON correctly from markdown blocks', () => {
      const mockResponse = '```json\n{"issues":[],"summary":"test"}\n```';
      const parsed = analyzer.parseAnalysisResult(mockResponse);

      expect(parsed.summary).toBe('test');
    });
  });

  describe('parseAnalysisResult', () => {
    it('should return fallback for invalid JSON', () => {
      const result = analyzer.parseAnalysisResult('invalid json');

      expect(result.issues).toEqual([]);
      expect(result.summary).toContain('parse');
    });

    it('should extract JSON wrapped in prose', () => {
      const wrapped = 'Here are the findings:\n```json\n{"issues":[],"summary":"ok"}\n```\nHope that helps!';
      const parsed = analyzer.parseAnalysisResult(wrapped);

      expect(parsed.summary).toBe('ok');
    });

    it('should fall back to first balanced object when fences are missing', () => {
      const prose = 'Analysis complete: {"issues":[{"type":"bug"}],"summary":"1 bug"} done';
      const parsed = analyzer.parseAnalysisResult(prose);

      expect(parsed.issues).toHaveLength(1);
      expect(parsed.summary).toBe('1 bug');
    });

    it('should handle a non-string result', () => {
      const parsed = analyzer.parseAnalysisResult(undefined);

      expect(parsed.issues).toEqual([]);
      expect(parsed.summary).toBe('LLM returned no content');
    });
  });
});