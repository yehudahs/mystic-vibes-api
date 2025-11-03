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

    const prompt = `You are an expert palmist. Provide a DIRECT and PRACTICAL palm reading.

${question ? `Question: "${question}"\n\nCRITICAL: Answer their question DIRECTLY in the first 2-3 sentences.\n` : ''}
Analyze these palm lines:
1. Heart Line (emotions/relationships) - length, depth, curves
2. Head Line (intellect/decisions) - straight or curved, depth
3. Life Line (vitality/changes) - arc depth, continuity
4. Fate Line (career/destiny) - presence, continuity

Style: Direct, specific, warm. Maximum 200-250 words. Focus on actionable insights.`

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
    const readingPrompt = `You are an expert palmist. Based on these palm features, provide a DIRECT and PRACTICAL reading:

PALM FEATURES:
${palmFeatures}

${question ? `\nQuestion: "${question}"\n\nCRITICAL: Answer their question DIRECTLY in the first 2-3 sentences.\n` : ''}

Interpret these features with SPECIFIC insights:
- Emotional life and relationships (Heart Line)
- Mental abilities and decision-making (Head Line)
- Life energy and major changes (Life Line)
- Career path and destiny (Fate Line)

Style: Direct, specific, warm. Maximum 200-250 words. End with ONE concrete piece of guidance.`

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

    const prompt = `You are an expert palmist. Analyze this palm image with FOCUSED attention on each major line:

${question ? `Question: "${question}"\n\nCRITICAL: Answer their question DIRECTLY first, then provide line analysis.\n` : ''}

**HEART LINE** (near fingers): Location, depth, curves → Emotional nature, relationships
**HEAD LINE** (middle): Length, depth, curves → Intellect, decision-making  
**LIFE LINE** (around thumb): Arc depth, continuity → Vitality, major life events
**FATE LINE** (vertical): Visibility, path → Career direction, destiny

Provide SPECIFIC interpretations for each line, then ONE key insight or action.

Style: Direct, organized, practical. Maximum 250 words.`

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
    const detailedPrompt = `You are an expert palmist. Initial observations:

${quickResult.content}

${question ? `Question: "${question}"\n\nCRITICAL: Answer their question DIRECTLY in the first 2-3 sentences.\n` : ''}

Provide a DIRECT, PRACTICAL palm reading:
1. Heart Line → Emotions, relationships (SPECIFIC insights)
2. Head Line → Intellect, mental patterns (SPECIFIC insights)
3. Life Line → Vitality, life path (SPECIFIC insights)
4. Fate Line → Career, destiny (SPECIFIC insights)
5. ONE key insight or action

Style: Direct, warm, actionable. Maximum 200-250 words.`

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

    const prompt = `As an expert palmist, analyze this palm using a DIRECT, STRUCTURED format:

${question ? `Question: "${question}"\n\n**ANSWER:** [Give DIRECT answer to their question first]\n\n` : ''}

## PALM ANALYSIS

**HEART LINE** (Emotions/Relationships):
[Observation] → [SPECIFIC interpretation]

**HEAD LINE** (Intellect/Decisions):
[Observation] → [SPECIFIC interpretation]

**LIFE LINE** (Vitality/Path):
[Observation] → [SPECIFIC interpretation]

**FATE LINE** (Career/Destiny):
[Observation] → [SPECIFIC interpretation]

**KEY INSIGHT:** [One main takeaway]
**ACTION:** [One concrete step they can take]

Style: Direct, organized, practical. Maximum 250 words.`

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
   * Method 6: Three-Stage Deep Analysis
   * Stage 1: Detect and isolate the hand
   * Stage 2: Identify and describe palm lines
   * Stage 3: Generate detailed reading
   */
  async threeStageDeepAnalysis(imageBase64, question = '', visionModel = 'llama3.2-vision:11b', textModel = 'llama3.1:latest') {
    console.log('📋 Method 6: Three-Stage Deep Analysis')
    console.log(`   Vision Model: ${visionModel}`)
    console.log(`   Text Model: ${textModel}`)

    // Stage 1: Hand Detection and Description
    const handDetectPrompt = `You are analyzing this image to locate and describe a human hand for palm reading.

TASK: Identify if there is a clear view of a human hand palm in this image.

Describe:
1. Is a hand clearly visible? (yes/no)
2. Which hand is it? (left or right)
3. Is the palm facing the camera? (yes/no)
4. Hand position and orientation
5. Image quality for palm reading (good/fair/poor)
6. Any obstructions or issues that would affect reading
7. Background and lighting conditions

Be objective and specific.`

    console.log('   Stage 1: Detecting hand...')
    const handDetectResult = await this.ollama.analyzeImage(imageBase64, handDetectPrompt, visionModel)
    const handDescription = handDetectResult.content

    // Stage 2: Palm Lines Identification
    const linesDetectPrompt = `You are a palmistry expert analyzing this hand image. Based on this hand description:

${handDescription}

Now, carefully examine the palm and identify these specific lines:

**HEART LINE** (horizontal, near base of fingers):
- Starting point, ending point
- Depth, clarity, continuity
- Curves, breaks, or special markings

**HEAD LINE** (horizontal, middle of palm):
- Starting point, ending point
- Straight or curved path
- Depth and clarity

**LIFE LINE** (curves around thumb base):
- Arc depth and width
- Starting point, ending point
- Continuity and strength

**FATE LINE** (vertical, center of palm):
- Presence (yes/no - not everyone has one)
- Starting point, ending point
- Continuity

**MINOR LINES** (if visible):
- Marriage lines, money lines, travel lines, etc.

**MOUNTS** (raised areas):
- Venus (thumb base), Jupiter (index finger), Saturn (middle), Apollo (ring), Mercury (pinky)

Provide detailed, objective observations only. Do not interpret yet.`

    console.log('   Stage 2: Identifying palm lines...')
    const linesDetectResult = await this.ollama.analyzeImage(imageBase64, linesDetectPrompt, visionModel)
    const palmLines = linesDetectResult.content

    // Stage 3: Generate Mystical Reading
    const readingPrompt = `You are a mystical palmist providing a comprehensive reading.

HAND DESCRIPTION:
${handDescription}

PALM LINES OBSERVED:
${palmLines}

${question ? `Question: "${question}"\n\nCRITICAL: Answer their question DIRECTLY in the first 2-3 sentences.\n\n` : ''}

Provide SPECIFIC insights based on observations:

**EMOTIONAL REALM** (Heart Line): Love life, emotional nature (SPECIFIC)
**MENTAL REALM** (Head Line): Thinking style, decision-making (SPECIFIC)
**PHYSICAL REALM** (Life Line): Vitality, major life events (SPECIFIC)
**DESTINY REALM** (Fate Line): Career path, purpose (SPECIFIC)

**KEY INSIGHT:** [One main takeaway]
**ACTION:** [One concrete step]

Style: Direct, warm, actionable. Maximum 200-250 words.`

    console.log('   Stage 3: Generating reading...')
    const readingResult = await this.ollama.generateResponse(readingPrompt)

    return {
      method: 'three-stage-deep-analysis',
      visionModel,
      textModel,
      reading: readingResult.content,
      handDescription,
      palmLines,
      metadata: {
        provider: handDetectResult.provider,
        usage: {
          stage1: handDetectResult.usage,
          stage2: linesDetectResult.usage,
          stage3: readingResult.usage,
          totalTokens: (handDetectResult.usage?.total_tokens || 0) +
                      (linesDetectResult.usage?.total_tokens || 0) +
                      (readingResult.usage?.total_tokens || 0)
        },
        stages: 3
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
        id: 'three-stage-deep-analysis',
        name: 'Three-Stage Deep Analysis',
        description: 'Hand detection → Line identification → Reading (most detailed)',
        stages: 3,
        speed: 'slow'
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
        m.name.includes('bakllava') ||
        m.name.includes('minicpm')
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
