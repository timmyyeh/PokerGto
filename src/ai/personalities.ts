export type PersonalityName = 'TAG' | 'LAG' | 'Rock' | 'Station' | 'GTO';

export type Personality = {
  name: PersonalityName;
  /** Min preflop strength to open-raise from any position. Lower = looser. */
  openThreshold: number;
  /** Min strength to call a raise preflop. */
  callRaiseThreshold: number;
  /** Min postflop strength to value bet. */
  valueBetThreshold: number;
  /** Min postflop strength to call a bet. */
  callBetThreshold: number;
  /** Probability of bluffing in spots where we'd otherwise check/fold. */
  bluffFreq: number;
  /** Preferred bet sizing as fraction of pot. */
  betSize: number;
  /** Re-raise size multiplier vs the bet they face. */
  raiseMultiplier: number;
};

export const PERSONALITIES: Record<PersonalityName, Personality> = {
  TAG: {
    name: 'TAG',
    openThreshold: 0.55,
    callRaiseThreshold: 0.62,
    valueBetThreshold: 0.55,
    callBetThreshold: 0.4,
    bluffFreq: 0.15,
    betSize: 0.66,
    raiseMultiplier: 3.0,
  },
  LAG: {
    name: 'LAG',
    openThreshold: 0.45,
    callRaiseThreshold: 0.5,
    valueBetThreshold: 0.45,
    callBetThreshold: 0.32,
    bluffFreq: 0.3,
    betSize: 0.75,
    raiseMultiplier: 3.5,
  },
  Rock: {
    name: 'Rock',
    openThreshold: 0.65,
    callRaiseThreshold: 0.72,
    valueBetThreshold: 0.6,
    callBetThreshold: 0.5,
    bluffFreq: 0.03,
    betSize: 0.5,
    raiseMultiplier: 2.5,
  },
  Station: {
    name: 'Station',
    openThreshold: 0.5,
    callRaiseThreshold: 0.4,
    valueBetThreshold: 0.55,
    callBetThreshold: 0.22,
    bluffFreq: 0.05,
    betSize: 0.5,
    raiseMultiplier: 2.5,
  },
  GTO: {
    name: 'GTO',
    openThreshold: 0.5,
    callRaiseThreshold: 0.55,
    valueBetThreshold: 0.5,
    callBetThreshold: 0.35,
    bluffFreq: 0.2,
    betSize: 0.66,
    raiseMultiplier: 3.0,
  },
};

export const PERSONALITY_LIST: PersonalityName[] = ['TAG', 'LAG', 'Rock', 'Station', 'GTO'];
