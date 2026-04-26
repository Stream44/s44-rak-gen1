export enum Opcode {
  LOAD_CONST = 0,
  MOVE,
  LOAD_INPUT,
  ADD,
  ADD_INT,
  SUB,
  MUL,
  DIV,
  MOD,
  NEG,
  ABS,
  EQ,
  NEQ,
  LT,
  LTE,
  GT,
  GTE,
  EQ_INT,
  EQ_STR,
  AND,
  OR,
  NOT,
  CONCAT,
  LEN,
  LEN_ARR,
  SUBSTR,
  CANONICALIZE,
  GET_FIELD,
  GET_FIELD_KNOWN,
  MAKE_RECORD,
  MAKE_ARRAY,
  MERGE,
  HEAD,
  TAIL,
  MAP,
  FILTER,
  FOLD,
  MATCHES,
  MAKE_CLOSURE,
  APPLY,
  JUMP,
  JUMP_IF_TRUE,
  JUMP_IF_FALSE,
  SWITCH_STR,
  MATCH_KNOWN,
  CALL_MORPHISM,
  CALL_MODULE,
  RET,
  GAS,
  TRACE,
  SUB_INT,
  MUL_INT,
  LT_INT,
  MAP_INT_INT,
  FILTER_RECORD_KNOWN_FIELD,
}

export const LOAD_CONST = Opcode.LOAD_CONST;
export const MOVE = Opcode.MOVE;
export const LOAD_INPUT = Opcode.LOAD_INPUT;
export const ADD = Opcode.ADD;
export const ADD_INT = Opcode.ADD_INT;
export const SUB = Opcode.SUB;
export const MUL = Opcode.MUL;
export const DIV = Opcode.DIV;
export const MOD = Opcode.MOD;
export const NEG = Opcode.NEG;
export const ABS = Opcode.ABS;
export const EQ = Opcode.EQ;
export const NEQ = Opcode.NEQ;
export const LT = Opcode.LT;
export const LTE = Opcode.LTE;
export const GT = Opcode.GT;
export const GTE = Opcode.GTE;
export const EQ_INT = Opcode.EQ_INT;
export const EQ_STR = Opcode.EQ_STR;
export const AND = Opcode.AND;
export const OR = Opcode.OR;
export const NOT = Opcode.NOT;
export const CONCAT = Opcode.CONCAT;
export const LEN = Opcode.LEN;
export const LEN_ARR = Opcode.LEN_ARR;
export const SUBSTR = Opcode.SUBSTR;
export const CANONICALIZE = Opcode.CANONICALIZE;
export const GET_FIELD = Opcode.GET_FIELD;
export const GET_FIELD_KNOWN = Opcode.GET_FIELD_KNOWN;
export const MAKE_RECORD = Opcode.MAKE_RECORD;
export const MAKE_ARRAY = Opcode.MAKE_ARRAY;
export const MERGE = Opcode.MERGE;
export const HEAD = Opcode.HEAD;
export const TAIL = Opcode.TAIL;
export const MAP = Opcode.MAP;
export const FILTER = Opcode.FILTER;
export const FOLD = Opcode.FOLD;
export const MATCHES = Opcode.MATCHES;
export const MAKE_CLOSURE = Opcode.MAKE_CLOSURE;
export const APPLY = Opcode.APPLY;
export const JUMP = Opcode.JUMP;
export const JUMP_IF_TRUE = Opcode.JUMP_IF_TRUE;
export const JUMP_IF_FALSE = Opcode.JUMP_IF_FALSE;
export const SWITCH_STR = Opcode.SWITCH_STR;
export const MATCH_KNOWN = Opcode.MATCH_KNOWN;
export const CALL_MORPHISM = Opcode.CALL_MORPHISM;
export const CALL_MODULE = Opcode.CALL_MODULE;
export const RET = Opcode.RET;
export const GAS = Opcode.GAS;
export const TRACE = Opcode.TRACE;
export const SUB_INT = Opcode.SUB_INT;
export const MUL_INT = Opcode.MUL_INT;
export const LT_INT = Opcode.LT_INT;
export const MAP_INT_INT = Opcode.MAP_INT_INT;
export const FILTER_RECORD_KNOWN_FIELD = Opcode.FILTER_RECORD_KNOWN_FIELD;
