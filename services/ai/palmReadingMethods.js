/**
 * Palm Reading Methods
 * Different strategies and models for palm reading analysis
 */

class PalmReadingMethods {
  constructor(ollamaProvider) {
    this.ollama = ollamaProvider
  }

  /**
   * Method 1: Direct Analysis (Single-Stage)
   * Analyzes the full image in one pass with vision model
   * Fast but may include background noise
   */
  async directAnalysis(imageBase64, question = '', model = 'llama3.2-vision:11b') {
    console.log('📋 Method 1: Direct Analysis')
    console.log(`   Model: ${model}`)

    const prompt = `You are an expert palmist. Analyze this palm image and provide a detailed reading.

${question ? `Question: ${question}\n` : ''}
Please analyze the palm lines and provide insights about:
1. Heart Line (emotions, relationships)
2. Head Line (intellect, decisions)
3. Life Line (vitality, major life changes)
4. Fate Line (career, life path)

Provide a comprehensive, mystical reading based on what you observe in the palm.`

    const result = await this.ollama.analyzeImage(imageBase64, prompt, model)

    return {
      method: 'direct-analysis',
      model,
      reading: result.content,
      metadata: {
        provider: result.provider,
        usage: result.usage,
        stages: 1
      }
    }
  }

  /**
   * Method 2: Two-Stage Analysis (Detect + Analyze)
   * Stage 1: Detect hand and describe features
   * Stage 2: Generate detailed reading based on features
   */
  async twoStageAnalysis(imageBase64, question = '', visionModel = 'llama3.2-vision:11b', textModel = 'llama3.1:latest') {
    console.log('📋 Method 2: Two-Stage Analysis')
    console.log(`   Vision Model: ${visionModel}`)
    console.log(`   Text Model: ${textModel}`)

    // Stage 1: Detect and describe palm features
    const detectPrompt = `Analyze this palm image as a palmistry expert. Focus only on describing what you see:

1. Identify the major palm lines (Heart Line, Head Line, Life Line, Fate Line)
2. Describe each line's characteristics: length, depth, curves, breaks
3. Note the hand shape and finger positions
4. Describe any special markings or patterns

Provide a detailed, objective description of the palm features you observe.`

    console.log('   Stage 1: Detecting palm features...')
    const detectResult = await this.ollama.analyzeImage(imageBase64, detectPrompt, visionModel)
    const palmFeatures = detectResult.content

    // Stage 2: Generate reading based on features
    const readingPrompt = `You are an expert palmist. Based on the following palm features, provide a mystical and insightful reading:

PALM FEATURES:
${palmFeatures}

${question ? `\nQUESTION: ${question}\n` : ''}

Provide a comprehensive palmistry reading that interprets these features, including:
- Emotional life and relationships (Heart Line)
- Mental abilities and decision-making (Head Line)
- Life energy and major changes (Life Line)
- Career path and destiny (Fate Line)

Give specific insights based on the described features.`

    console.log('   Stage 2: Generating reading from features...')
    const readingResult = await this.ollama.generateResponse(readingPrompt)

    return {
      method: 'two-stage-analysis',
      visionModel,
      textModel,
      reading: readingResult.content,
      palmFeatures,
      metadata: {
        provider: detectResult.provider,
        usage: {
          stage1: detectResult.usage,
          stage2: readingResult.usage,
          totalTokens: (detectResult.usage?.total_tokens || 0) + (readingResult.usage?.total_tokens || 0)
        },
        stages: 2
      }
    }
  }

  /**
   * Method 3: Focused Line Analysis
   * Asks the model to focus on each line separately for detailed analysis
   */
  async focusedLineAnalysis(imageBase64, question = '', model = 'llama3.2-vision:11b') {
    console.log('📋 Method 3: Focused Line Analysis')
    console.log(`   Model: ${model}`)

    const prompt = `You are an expert palmist analyzing this palm image. Focus on each major line separately for detailed analysis:

**HEART LINE** (horizontal line near fingers):
- Location, length, depth, curves
- Interpretation: emotional nature, relationships, love life

**HEAD LINE** (horizontal line in middle):
- Location, length, depth, curves
- Interpretation: intellect, learning style, decision-making

**LIFE LINE** (curved line around thumb):
- Location, length, depth, curves
- Interpretation: vitality, major life events, energy levels

**FATE LINE** (vertical line up palm):
- Location, length, depth, visibility
- Interpretation: career path, life direction, destiny

${question ? `\nUSER QUESTION: ${question}\n` : ''}

Provide a detailed reading organized by each line, then synthesize an overall interpretation.`

    const result = await this.ollama.analyzeImage(imageBase64, prompt, model)

    return {
      method: 'focused-line-analysis',
      model,
      reading: result.content,
      metadata: {
        provider: result.provider,
        usage: result.usage,
        stages: 1,
        approach: 'line-by-line'
      }
    }
  }

  /**
   * Method 4: Comparative Analysis
   * Uses smaller, faster model for initial pass, then detailed analysis
   */
  async comparativeAnalysis(imageBase64, question = '', fastModel = 'llama3.2-vision:11b', detailedModel = 'llama3.2-vision:11b') {
    console.log('📋 Method 4: Comparative Analysis')
    console.log(`   Fast Model: ${fastModel}`)
    console.log(`   Detailed Model: ${detailedModel}`)

    // Quick initial assessment
    const quickPrompt = `Briefly identify the major palm lines visible in this image and note any prominent features. Be concise.`

    console.log('   Stage 1: Quick assessment...')
    const quickResult = await this.ollama.analyzeImage(imageBase64, quickPrompt, fastModel)

    // Detailed analysis
    const detailedPrompt = `You are an expert palmist. Here's what was initially observed:

${quickResult.content}

${question ? `Question: ${question}\n` : ''}

Now provide a comprehensive, mystical palm reading that includes:
1. Detailed interpretation of the Heart Line (emotions, relationships)
2. Detailed interpretation of the Head Line (intellect, mental patterns)
3. Detailed interpretation of the Life Line (vitality, life path)
4. Detailed interpretation of the Fate Line (career, destiny)
5. Overall synthesis and guidance

Make it insightful and meaningful.`

    console.log('   Stage 2: Detailed analysis...')
    const detailedResult = await this.ollama.analyzeImage(imageBase64, detailedPrompt, detailedModel)

    return {
      method: 'comparative-analysis',
      fastModel,
      detailedModel,
      reading: detailedResult.content,
      quickAssessment: quickResult.content,
      metadata: {
        provider: detailedResult.provider,
        usage: {
          stage1: quickResult.usage,
          stage2: detailedResult.usage,
          totalTokens: (quickResult.usage?.total_tokens || 0) + (detailedResult.usage?.total_tokens || 0)
        },
        stages: 2
      }
    }
  }

  /**
   * Method 5: Structured Prompt Analysis
   * Uses a highly structured prompt for consistent output
   */
  async structuredAnalysis(imageBase64, question = '', model = 'llama3.2-vision:11b') {
    console.log('📋 Method 5: Structured Analysis')
    console.log(`   Model: ${model}`)

    const prompt = `As an expert palmist, analyze this palm image using the following structured format:

## PALM READING ANALYSIS

### 1. HEART LINE (Emotional Life)
**Observation:** [Describe what you see]
**Interpretation:** [What this means for emotions and relationships]

### 2. HEAD LINE (Mental Life)
**Observation:** [Describe what you see]
**Interpretation:** [What this means for intellect and decisions]

### 3. LIFE LINE (Physical Life)
**Observation:** [Describe what you see]
**Interpretation:** [What this means for vitality and life path]

### 4. FATE LINE (Destiny)
**Observation:** [Describe what you see]
**Interpretation:** [What this means for career and purpose]

### 5. OVERALL SYNTHESIS
**Key Insights:** [Main takeaways from the reading]
**Guidance:** [Advice based on the palm analysis]

${question ? `\n### 6. ANSWER TO YOUR QUESTION\n"${question}"\n**Response:** [Specific answer based on palm features]\n` : ''}

Provide detailed, insightful analysis for each section.`

    const result = await this.ollama.analyzeImage(imageBase64, prompt, model)

    return {
      method: 'structured-analysis',
      model,
      reading: result.content,
      metadata: {
        provider: result.provider,
        usage: result.usage,
        stages: 1,
        format: 'structured'
      }
    }
  }

  /**
   * Get available methods
   */
  getAvailableMethods() {
    return [
      {
        id: 'direct-analysis',
        name: 'Direct Analysis',
        description: 'Single-stage analysis with vision model (fastest)',
        stages: 1,
        speed: 'fast'
      },
      {
        id: 'two-stage-analysis',
        name: 'Two-Stage Analysis',
        description: 'Detect features first, then generate reading (most accurate)',
        stages: 2,
        speed: 'medium'
      },
      {
        id: 'focused-line-analysis',
        name: 'Focused Line Analysis',
        description: 'Analyzes each palm line separately for detail',
        stages: 1,
        speed: 'fast'
      },
      {
        id: 'comparative-analysis',
        name: 'Comparative Analysis',
        description: 'Quick pass then detailed analysis',
        stages: 2,
        speed: 'medium'
      },
      {
        id: 'structured-analysis',
        name: 'Structured Analysis',
        description: 'Highly organized output format',
        stages: 1,
        speed: 'fast'
      }
    ]
  }

  /**
   * Get available models
   */
  async getAvailableModels() {
    try {
      const models = await this.ollama.listModels()
      const visionModels = models.filter(m =>
        m.name.includes('vision') ||
        m.name.includes('llava') ||
        m.name.includes('bakllava')
      )
      return visionModels.map(m => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at
      }))
    } catch (error) {
      console.error('Error listing models:', error)
      return [{ name: 'llama3.2-vision:11b', size: 'unknown', modified: null }]
    }
  }
}

export default PalmReadingMethods
