# triLanguage — Giai đoạn 5: Exercise Coverage + Grading

## Tóm tắt

Đã hoàn thành **Giai đoạn 5** theo Architecture mục 17.5:
- **Zod schemas**: flashcard + MCQ payloads với validation chặt (4 options duy nhất, correct_option_id hợp lệ)
- **Coverage engine**: `computeRequiredItemRefs()` truy all item-level refs từ fields_json (synonyms.[i].value, meaning_vi.[i], collocations.[i].vi_meaning…)
- **Exercise validator**: xác minh declared refs có thật trong card; báo missing refs
- **Static template builder**: `buildFlashcardTemplate` + `buildMcqTemplate` deterministic, không gọi AI
- **Session creation route**: `POST /api/notebooks/:id/cards/:id/sessions` tạo phiên học mới
- **Grading deterministic**: MCQ đúng→Easy/sai→Again; flashcard self_rating mapping qua F.3
- **Budget per level**: level 0–6 quyết định số bài tối đa/thẻ/phiên (10→3)

## Các file đã tạo

| Đường dẫn | Mô tả |
|---|---|
| `worker/schemas/exercises.ts` | Flashcard + MCQ Zod schemas; answer schemas |
| `worker/services/coverageEngine.ts` | Required refs, uncovered refs, priority partition, budget per level |
| `worker/services/exerciseValidator.ts` | Validate declared refs against real card data |
| `worker/services/templateExercises.ts` | Deterministic flashcard/MCQ generation from field data |
| `worker/repositories/exercise.ts` | Session CRUD (create, complete) with notebook scope |
| `worker/routes/exerciseSessions.ts` | GET sessions, POST create session with coverage-aware selection |
| `tests/unit/coverage-engine.test.ts` | 12 tests: required refs extraction, uncovered filtering, budgets |
| `tests/unit/exercise-validator.test.ts` | 11 tests: valid/invalid/missed refs, hasAnyFieldData |
| `tests/unit/template-exercises.test.ts` | 4 tests + FULL_CARD/MINIMAL_CARD fixtures |

## Các file đã sửa

| File | Thay đổi |
|---|---|
| `worker/index.ts` | Đăng ký exerciseSessionRoutes |
| `worker/schemas/exercises.ts` | Dùng z.union thay discriminatedUnion để fix TS typing |

## Migration
Không cần migration mới — bảng `exercises`, `exercise_sessions`, `exercise_attempts` đã có trong `db/migrations/001_init.sql`.

## Kết quả kiểm thử

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ 0 lỗi |
| `npx eslint worker src --ext .ts,.tsx` | ✅ 0 errors, 6 warnings (D1 BLOB `any` từ Phase 2 + 1 ở route mới) |
| `npx vitest run` | ✅ **112/112 tests pass** (+27 so với Phase 4) |
| `npx vite build` | ✅ Thành công |

### Test fixture coverage
- **FULL_CARD_FIXTURE**: 19 item refs (meaning_vi×2, synonyms×2, collocations×2, example_sentences×2, example_translations×2, phonetic, word_type)
- **MINIMAL_CARD_FIXTURE**: 1 item ref (meaning_vi.0)

### Validator rejection tests
- Declared refs not matching card data → `valid: false`, lists invalid + missed
- Parent-path refs accepted (e.g. `synonyms` covers `synonyms.0.value`)
- Empty/null array items ignored

### Template fallback behavior
- MCQ generated when ≥4 distinct values exist in target field
- Falls back to flashcard when not enough distractors
- All template exercises have grounded tested_item_refs

## Kiểm tra bảo mật
- ✅ Không hard-code secret/API key trong source hoặc bundle dist/
- ✅ Mọi query đều scoped theo notebook_id + owner verification
- ✅ AI không tham gia tính exercise content (template-based deterministic)
- ✅ Validated refs trước khi lưu vào DB
- ✅ CSRF protection trên POST session endpoint

## Tiêu chí Phase 5

| Tiêu chí Architecture | Kết quả | Bằng chứng |
|---|---|---|
| Ma trận field → exercise schema | Đạt | Schema flashcard + MCQ với full field coverage |
| Zod validate payload (4 option, unique IDs, correct exists) | Đạt | Schema `.refine()` checks + unit tests |
| Server computes required_item_refs (không tin AI) | Đạt | `computeRequiredItemRefs()` pure function |
| Validator phát hiện forged refs | Đạt | `validateExerciseRefs()` rejects unknown refs |
| Static template khi AI quota exceeded | Đạt | `buildFlashcardTemplate` + `buildMcqTemplate` |
| Rating mapping deterministic | Đã có từ Phase 3 | `aggregateSessionScores()` dùng F.3 buckets |
| Test fixture cố tình khai coverage sai bị server phát hiện | Đạt | Unit tests: invalidRefs populated correctly |
| Hết quota vẫn hoàn tất session bằng template | Đạt | Route tự sinh template khi thiếu data |
| Chưa đủ coverage không ghi FSRS review | **Chưa kiểm chứng** | Cần integration test với D1 thật |
| Không vượt quá 10 bài/thẻ/phiên | Đạt | `MAX_EXERCISES_PER_SESSION = 10` enforced |
| Budget giảm theo level (10→3) | Đạt | `getSessionBudget()` + unit tests |

## Rủi ro còn lại
- Chưa có integration test end-to-end với D1 thật cho "chưa đủ coverage → skip FSRS"
- Chưa có UI flow chấp nhận/refuse exercise set trước khi bắt đầu session
- Chưa có AI-generated MCQ ( Phase 4 tạo enrichment/tutor; AI exercise generation sẽ là Phase 5+ extension)

## Việc không thực hiện (nằm ngoài Phase 5)
- Frontend exercise player UI (Phase sau)
- AI-generated MCQ với distractor đáng tin (cần Agnes + retry logic Phase 5 mở rộng)
- Placement test, skill profile (Phase 6)
- Offline sync, IndexedDB outbox (Phase 6)

---
Dừng và chờ chủ dự án xác nhận trước khi chuyển sang **Giai đoạn 6**.
