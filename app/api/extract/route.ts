import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Vercel Hobby 티어의 10초 timeout 우회
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { text, mode } = await req.json();

    const modeInstruction =
      mode === 'word'
        ? '단일 단어(word) 위주로 추출하세요.'
        : mode === 'phrase'
        ? '구(phrase), 숙어(idiom), 표현(expression) 위주로 추출하세요.'
        : '단어와 구문을 모두 추출하세요.';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2, // 낮게 설정해 의미 일관성 향상
      messages: [
        {
          role: 'system',
          content: `당신은 한국 영어학습자를 위한 최고의 어휘 데이터 엔지니어입니다.
주어진 텍스트에서 영어 어휘를 추출하여 학습 데이터로 변환합니다.

[추출 정책]
${modeInstruction}

[N+1 밀림(Offset) 무손실 복구]
- 사용자 입력에 단어와 뜻이 한 줄씩 어긋나있더라도 (예: warning -> wash -> 경고문) 문맥과 사전 지식을 활용해 올바른 짝을 맞춰주세요.
- 의미 없는 알파벳 찌꺼기(W, D, F, zero 등)는 무시하되, 유의미한 영단어는 누락 없이 파싱하세요.

[★ 다중 의미 보장 - 가장 중요한 규칙 ★]
모든 단어/구문은 반드시 콤마(,)로 구분된 한국어 의미를 **2~4개 이상** 반환해야 합니다.
사용자가 어떤 한국어 표현을 떠올리든 정답 처리될 수 있도록 가장 흔한 동의어/유의어를 풍부하게 포함하세요.

학습자 친화적 의미 풀(pool) 예시:
- "seek" → "추구하다, 찾다, 원하다, 모색하다, 구하다"
- "positivity" → "긍정성, 긍정적 성향, 긍정적인 태도, 낙관"
- "enriching" → "풍부하게 하다, 비옥하게 하다, 질을 높이다, 향상시키다"
- "subtle" → "미묘한, 은근한, 섬세한, 교묘한"
- "overwhelm" → "압도하다, 휩싸다, 제압하다, 벅차게 하다"
- "give up" → "포기하다, 단념하다, 그만두다, 손을 떼다"
- "look forward to" → "기대하다, 고대하다, 학수고대하다"

학습자가 한 단어만 알고 있어도 정답이 되도록, 가능한 한 보편적인 한국어 표현부터 우선 배치하세요.

[형식 규칙]
- "ko" 필드: 콤마로 구분된 한국어 의미 (반드시 2개 이상, 가장 흔한 표현이 첫번째)
- "en" 필드: 영어 단어 또는 구
- "pos" 필드: 품사를 영어로 (Noun, Verb, Adjective, Adverb, Phrase, Idiom). 약어(n., v.) 사용 금지
- "phonetics" 필드: 발음기호 (모르면 빈 문자열 "")

[출력 JSON 형식 - 반드시 이 구조로]
{
  "words": [
    { "en": "seek", "ko": "추구하다, 찾다, 원하다, 모색하다", "pos": "Verb", "phonetics": "/siːk/" },
    { "en": "positivity", "ko": "긍정성, 긍정적 성향, 낙관", "pos": "Noun", "phonetics": "/pɒzɪˈtɪvɪti/" }
  ]
}`,
        },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
    });

    const content = response.choices[0].message.content;
    const data = JSON.parse(content || '{"words": []}');
    return NextResponse.json(data.words || []);
  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    return NextResponse.json({ error: 'AI 분석 중 서버 오류 발생' }, { status: 500 });
  }
}
