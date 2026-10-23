import { buildNarrative, EVIDENCE_LABEL, NOTE_TEXT } from '../src/domain/narrative';
import type { Candidate } from '../src/domain/correlation';

const base: Candidate = {
  key: 'a:x', name: '朝ヨガ', group: '朝要因', kind: 'approach', more: '', rho: 0.5, p: 0.001, n: 60,
  evidence: 'likely', strength: 'strong', positive: true,
  detail: { type: 'binary', nA: 30, nB: 30, meanA: 3.8, meanB: 2.6 },
};
const sleep = (key: string, name: string, more: string, rho: number): Candidate => ({
  key, name, group: '睡眠', kind: 'sleep', more, rho, p: 0.01, n: 60, evidence: 'likely', strength: 'moderate', positive: rho > 0,
  detail: { type: 'numeric', cut: 7, nLow: 30, nHigh: 30, meanLow: rho > 0 ? 2.8 : 3.6, meanHigh: rho > 0 ? 3.6 : 2.8 },
});

describe('buildNarrative', () => {
  it('一覧の一文に、向き・強さ・困りごとの名前が入る', () => {
    expect(buildNarrative('頭痛', base).headline).toBe('「朝ヨガ」を実施した日は、「頭痛」の調子がはっきり良い傾向があります');
    expect(buildNarrative('頭痛', { ...base, positive: false, rho: -0.5 }).headline).toContain('はっきり悪い傾向');
    expect(buildNarrative('頭痛', { ...base, strength: 'tiny', rho: 0.05 }).headline).toContain('ごくわずかな差');
    expect(buildNarrative('頭痛', sleep('s:hours', '睡眠時間', '長い', 0.4)).headline).toBe('睡眠時間が長い日ほど、「頭痛」の調子がかなり良い傾向があります');
  });

  it('数字は言葉に（平均の差を「段階」で）、点数の向きも添える', () => {
    const n = buildNarrative('頭痛', base);
    expect(n.numbers[0]).toContain('実施した日が 3.8（30日）、しなかった日が 2.6（30日）');
    expect(n.numbers[0]).toContain('平均でおよそ1段階の差');
    expect(n.numbers[1]).toContain('5が一番良く、1が調子が悪い');
  });

  it('想定される理由は、要因の種類と向きに合ったものを2つ出す。逆の関係の可能性にも触れる', () => {
    const alcohol = buildNarrative('頭痛', { ...base, key: 'q:y', name: '前日にお酒を飲んだの量（杯）', group: '前夜要因', kind: 'quantity', more: '多い', positive: false, rho: -0.4 });
    expect(alcohol.reasons.join('')).toContain('アルコール');
    const ex = buildNarrative('肩のつらさ', { ...base, name: '腕立', group: '運動要因', positive: false });
    expect(ex.reasons.join('')).toContain('逆の関係');
    expect(buildNarrative('頭痛', sleep('s:awake', '中途覚醒の回数', '多い', -0.4)).reasons[0]).toContain('夜中に目が覚める');
    for (const c of [base, sleep('s:hours', '睡眠時間', '長い', 0.4), sleep('s:bed', '就寝時刻', '遅い', -0.3)]) {
      expect(buildNarrative('頭痛', c).reasons.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('睡眠の項目では、睡眠を減らす・短くする提案は出さない（どの向きでも）', () => {
    for (const k of [['s:hours', '睡眠時間', '長い'], ['s:bed', '就寝時刻', '遅い'], ['s:wake', '起床時刻', '遅い'], ['s:awake', '中途覚醒の回数', '多い'], ['s:nap', '昼寝の時間', '長い']] as const) {
      for (const rho of [0.4, -0.4]) {
        const t = buildNarrative('頭痛', sleep(k[0], k[1], k[2], rho)).tip;
        expect(t).not.toMatch(/減らし|控え|短く|削/);
      }
    }
  });

  it('注意の一文と、印の言葉', () => {
    expect(buildNarrative('頭痛', base).note).toBe(NOTE_TEXT);
    expect(NOTE_TEXT).toContain('確定ではありません');
    expect(EVIDENCE_LABEL).toEqual({ likely: '最有力', maybe: '要注目', weak: 'ヒント程度' });
  });
});
