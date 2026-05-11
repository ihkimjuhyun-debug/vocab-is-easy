import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Vercel Hobby 티어의 10초 timeout 우회
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================
// 모드별 시스템 프롬프트 빌더
// ============================================================
const buildSystemPrompt = (mode: string) => {
  const common = `당신은 한국 영어학습자를 위한 최고의 어휘/표현 데이터 엔지니어입니다.
주어진 텍스트에서 학습 항목을 추출해 JSON으로 변환합니다.

[공통 - N+1 밀림(Offset) 복구]
- 단어와 뜻이 한 줄씩 어긋나있어도 (예: warning -> wash -> 경고문) 문맥과 사전 지식으로 짝을 맞추세요.
- OCR/오타로 깨진 글자(lt → It, ~을 같은 패턴)는 정확히 복구하세요.
- 의미 없는 알파벳 찌꺼기(W, D, F, zero 등)는 무시하되 유의미한 영어 표현은 빠뜨리지 마세요.

[공통 - 출력 형식]
- "en" 필드: 영어 표현
- "ko" 필드: 한국어 의미 (콤마로 구분된 다중 의미)
- "pos" 필드: 품사 또는 유형 (Noun, Verb, Adjective, Adverb, Phrase, Expression, Template)
- "phonetics" 필드: 발음기호 (없으면 빈 문자열)
- 반환: { "words": [ {...}, ... ] }
`;

  if (mode === 'word') {
    return common + `
[★ Word 모드 - 단어 단위 추출 ★]
단일 단어(word) 위주로 추출하세요.

[다중 의미 보장 ★★★]
모든 단어는 반드시 **2~4개 이상의 한국어 동의어**를 콤마로 구분해 반환하세요.
예시:
- "seek" → "추구하다, 찾다, 원하다, 모색하다"
- "positivity" → "긍정성, 긍정적 성향, 낙관"
- "subtle" → "미묘한, 은근한, 섬세한, 교묘한"
- "overwhelm" → "압도하다, 휩싸다, 제압하다, 벅차게 하다"
`;
  }

  if (mode === 'phrase') {
    return common + `
[★★★ Phrase 모드 - 템플릿 문장 통째 추출 모드 ★★★]
이 모드는 **단어가 아닌 "템플릿 문장 단위(chunk)"** 로 추출합니다.
영어 작문/스피킹 시험(OPIc, TOEIC Speaking, IELTS Writing 등)의 모범 문장 패턴을 학습하기 위함입니다.

[★ 최우선 원칙 - 절대로 단어로 쪼개지 마세요 ★]
의미가 통하는 영어 표현 한 덩어리(chunk)를 하나의 항목으로 묶으세요.
한 줄 안에 여러 chunk가 보이면 각각 분리해 추출하세요.

[추출 대상 패턴]

(A) **"영어 (한국어 뜻)" 형식의 명시적 템플릿**
   입력: "This photo might have been taken in (~에서 찍혔을지도 모릅니다) 장소"
   → { "en": "This photo might have been taken in", "ko": "~에서 찍혔을지도 모릅니다, ~에서 촬영된 것 같다" }

(B) **"영어 단어(한국어)" 형식의 부분 주석**
   입력: "It is interesting to note(알아차리다) that S+V"
   → { "en": "It is interesting to note that S+V", "ko": "~을 주목할 만하다, ~을 알아차리는 점이 흥미롭다" }

(C) **에세이/스피킹 단골 표현 (한국어 뜻이 명시 안 되어도 추출)**
   - "Over the past few years," → "지난 몇 년간, 최근 몇 년 동안"
   - "based on the fact that S V" → "~사실에 근거하여, ~을 토대로"
   - "in order to + 동사원형" → "~하기 위해서"
   - "It is clearly shown in the picture that S+V" → "그림에 분명히 나타나 있다"
   - "To conclude, given the reasons discussed above" → "위에서 논의한 이유에 비추어 결론적으로"
   - "I am inclined to believe that" → "~라고 믿는 경향이 있다"
   - "While some people may assert that [주장]" → "어떤 사람들은 ~라고 주장할 수 있다"
   - "Most importantly," → "무엇보다 중요한 것은"
   - "Undoubtedly, it is undeniable that" → "의심할 여지없이 ~이다"
   - "To sum up," / "To summarize," → "요약하자면"

(D) **Placeholder 보존 - 시험용 자리표시자는 그대로 유지**
   S+V, S V, [주제], [내 의견], 동사원형, ~을, ~에서, [형용사] 같은 placeholder는 영어/한국어 양쪽에서 절대 빼지 말고 그대로 보존하세요.
   학습자가 자리 표시자를 보고 맥락을 익힙니다.

(E) **앞뒤 연결사도 chunk 안에 포함**
   "leading to heated debates" / "fostering appreciation for" 같은 분사구문도 한 덩어리로 잡으세요.

[금지 사항]
- 템플릿을 "It", "is", "interesting", "to", "note" 같은 단어 단위로 절대 쪼개지 마세요.
- 단순한 1-2단어 표현은 가능하면 주변 단어와 합쳐서 더 큰 chunk로 묶어주세요. (단, 의미가 살아있는 선에서)
- pos는 "Expression" 또는 "Template"으로 통일하세요.

[ko 필드 작성 규칙]
- 입력에 한국어 뜻이 명시되어 있으면 그것을 첫 번째로 우선 사용
- 추가로 자연스러운 동의 표현 1-2개를 콤마로 덧붙이세요
- 핵심 의미를 살린 자연스러운 한국어로
`;
  }

  // mode === 'both'
  return common + `
[★ Complex 모드 - 단어 + 템플릿 모두 추출 ★]
단어와 템플릿 문장을 모두 추출하되, 각각 자기 형식을 지키세요.

[단어 (Noun/Verb/Adjective 등)]
- 반드시 2~4개 이상의 한국어 동의어를 콤마로 구분
- 예: "seek" → "추구하다, 찾다, 원하다, 모색하다"

[템플릿 문장 (Expression/Template)]
- "(영어) (한국어)" 패턴이나 학습용 모범 문장이 보이면 chunk 단위로 통째로 추출
- 절대 단어 단위로 쪼개지 마세요
- placeholder(S+V, [주제], 동사원형 등)는 보존
- 예: "This photo might have been taken in" → "~에서 찍혔을지도 모릅니다"
- 예: "Over the past few years" → "지난 몇 년간"

[pos 구분]
- 단어: Noun, Verb, Adjective, Adverb
- 템플릿: Expression 또는 Template
`;
};

// ============================================================
// API 핸들러
// ============================================================
export async function POST(req: Request) {
  try {
    const { text, mode } = await req.json();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      messages: [
        { role: 'system', content: buildSystemPrompt(mode) },
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
