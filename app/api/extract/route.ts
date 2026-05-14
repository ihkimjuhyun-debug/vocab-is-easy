import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Vercel Hobby 티어 10초 timeout 우회
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================
// 공통 규칙 (모든 모드에 공통 적용)
// ============================================================
const COMMON_RULES = `당신은 한국 영어학습자를 위한 최고의 어휘/표현 데이터 엔지니어입니다.
주어진 텍스트에서 학습 항목을 추출해 JSON으로 변환합니다.

[★ 누락 금지 - 모든 어휘/표현을 빠짐없이 추출 ★]
입력 텍스트의 모든 단어/표현을 추출하세요. 너무 쉬운 기초 단어라도 일단 추출하되, 아래의 active 필드로 표시만 다르게 합니다.

[공통 - N+1 밀림(Offset) 복구]
- 단어와 뜻이 한 줄씩 어긋나있어도 문맥과 사전 지식으로 짝을 맞추세요.
- OCR/오타로 깨진 글자(lt → It, ~을 같은 패턴)는 정확히 복구하세요.

[공통 - 출력 형식]
- "en" 필드: 영어 표현
- "ko" 필드: 한국어 의미 (콤마로 구분된 다중 의미, 직접 번역만)
- "pos" 필드: 품사 또는 유형 (Noun, Verb, Adjective, Adverb, Phrase, Expression, Template, Pronoun, Preposition 등)
- "phonetics" 필드: 발음기호 (없으면 빈 문자열)
- "active" 필드: boolean (기본 true; 너무 기본적인 단어만 false)
- 반환: { "words": [ {...}, ... ] }

[★★★ active 필드 - 학습 추천 여부 ★★★]
모든 항목에 "active" boolean을 포함하세요. 기본은 true.
다음 경우에만 active: false로 표시:
- 인칭대명사: I, you, he, she, it, we, they, me, him, her, us, them
- 관사: a, an, the
- be 동사 기본형: is, am, are, was, were, been, be, being
- 기초 전치사: in, on, at, to, for, of, with, by, from, into, onto, up, down
- 기초 접속사: and, or, but, so, because, if, when, while
- 지시어: this, that, these, those, here, there
- 기초 동사: do, does, did, have, has, had, go, goes, went, get, got, make, made, take, took, give, gave
- 기초 의문사: what, who, where, when, why, how, which
- 기초 수량어: some, any, all, every, no, much, many, more, most, few, little

원칙: 모든 단어를 빠짐없이 추출하되, 위의 초등 1-2학년 수준만 active: false. 
중간 난이도부터는 무조건 active: true.

[★★★ 다품사 분리 - 명사+동사 같이 쓰이는 단어 ★★★]
한 영어 단어가 명사로도 동사로도 흔히 쓰이는 경우 **별개 항목 2개로 분리**해 반환하세요.

대표적인 다품사 단어 (이런 단어들은 무조건 분리):
challenge, study, work, plan, design, search, support, view, hope, dream, change, increase, decrease, force, light, water, fight, look, help, walk, run, talk, call, answer, question, attack, drink, smile, laugh, cry, kiss, dance, sleep, rest, visit, return, watch, attempt, demand, request, offer, fear, doubt, care, control, balance, focus, share, mark, point, count, order, claim, name, place, face, hand, head, back, end, start

예시:
입력: "challenge"
출력: 
{ "en": "challenge", "pos": "Noun", "ko": "도전, 어려움, 난제", "phonetics": "[ˈtʃæl.ɪndʒ]", "active": true }
{ "en": "challenge", "pos": "Verb", "ko": "도전하다, 이의를 제기하다, 시험하다", "phonetics": "[ˈtʃæl.ɪndʒ]", "active": true }

분리 기준:
- 명사 의미와 동사 의미가 명확히 다른 경우만 분리
- 단순한 명사형/동사형 변화(write-writes)는 분리 안 함
- 명백히 한 품사로만 쓰이는 단어(beautiful, quickly, mother)는 분리 안 함

[★ ko 필드 작성 규칙 - 직접 번역만 ★]
"ko" 필드에는 "en" 표현의 직접 번역만 들어가야 합니다.
다음을 절대 포함하지 마세요:
- 주변 문맥/설명 문장
- 다음 줄에 이어지는 별개 표현의 한국어 의미
- 사용 예시 설명

각 영어 표현은 독립된 항목입니다. 한 항목의 ko 필드에 여러 표현의 뜻이 섞이지 않게 주의하세요.

[★ 나쁜 예 vs 좋은 예]
입력: "In addition, [내용] could be another efficient method in order to V."
❌ 잘못: { "en": "In addition", "ko": "게다가, ~하기 위한 또 다른 효율적인 방법이 될 수 있다" }
✓ 올바름:
{ "en": "In addition", "ko": "게다가, 또한, 추가로", "pos": "Expression", "active": true },
{ "en": "could be another efficient method in order to V", "ko": "~하기 위한 또 다른 효율적인 방법이 될 수 있다", "pos": "Template", "active": true }
`;

// ============================================================
// 모드별 시스템 프롬프트
// ============================================================
const buildSystemPrompt = (mode: string) => {
  if (mode === 'word') {
    return COMMON_RULES + `
[★ Word 모드 - 단어 단위 추출 ★]
단일 단어(word) 위주로 추출하세요. 모든 단어를 빠짐없이.

[다중 의미 보장 ★★★]
모든 단어는 반드시 **2~4개 이상의 한국어 동의어**를 콤마로 구분 (직접 번역만, 설명문 X)
예시:
- "seek" → "추구하다, 찾다, 원하다, 모색하다" ✓
- "subtle" → "미묘한, 은근한, 섬세한, 교묘한" ✓
`;
  }

  if (mode === 'phrase') {
    return COMMON_RULES + `
[★★★ Phrase 모드 - 템플릿 문장 통째 추출 ★★★]
단어가 아닌 "템플릿 문장 단위(chunk)"로 추출합니다.
영어 작문/스피킹 시험(OPIc, TOEIC Speaking, IELTS Writing 등)의 모범 문장 패턴 학습용.

[원칙 - 절대로 단어로 쪼개지 마세요]
의미가 통하는 영어 표현 한 덩어리(chunk)를 하나의 항목으로 묶으세요.

[추출 대상 패턴]
(A) "영어 (한국어)" 명시적 템플릿
   예: "This photo might have been taken in (~에서 찍혔을지도 모릅니다)"
   → { "en": "This photo might have been taken in", "ko": "~에서 찍혔을지도 모릅니다", "pos": "Template", "active": true }

(B) "영어 단어(한국어)" 부분 주석
   예: "It is interesting to note(알아차리다) that S+V"
   → { "en": "It is interesting to note that S+V", "ko": "주목할 만하다, ~을 알아차리는 점이 흥미롭다", "pos": "Expression", "active": true }

(C) 에세이/스피킹 단골 표현
   - "Over the past few years," → "지난 몇 년간"
   - "based on the fact that" → "~사실에 근거하여"
   - "In addition," → "게다가, 또한"

(D) Placeholder 보존: S+V, [주제], 동사원형, ~을 등 그대로 유지

[ko 필드 길이 제한]
- 짧은 표현은 직접 번역 2-3개 (전체 30자 이내)
- 긴 템플릿은 직접 번역만, 주변 문맥 추가 금지
- ko가 en보다 비정상적으로 길면 분리해서 새 항목으로 만드세요

[Phrase 모드의 active]
템플릿/표현은 대부분 active: true (시험용 학습 가치 있음).
너무 흔한 단순 표현("hello", "thank you")만 active: false.
`;
  }

  return COMMON_RULES + `
[★ Complex 모드 - 단어 + 템플릿 모두 추출 ★]
단어와 템플릿 문장을 모두 빠짐없이 추출하되, 각각 자기 형식을 지키세요.

[단어 (Noun/Verb/Adjective)]
- 2~4개 이상 한국어 동의어 (직접 번역만)
- 다품사(challenge, study 등)는 명사/동사 별개 항목으로 분리
- 기초 단어는 active: false

[템플릿 (Expression/Template)]
- chunk 단위로 통째 추출, 단어로 쪼개지 않기
- placeholder 보존
- ko에 주변 문맥 추가 금지

[pos 구분]
- 단어: Noun, Verb, Adjective, Adverb, Pronoun
- 템플릿: Expression, Template
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
