# triLanguage — Giai đoạn 4: AI Adapter + Enrichment + Tutor

## Tóm tắt

Đã hoàn thành **Giai đoạn 4** theo Architecture mục 17.4:
- **Agnes adapter** OpenAI-compatible qua `fetch` trực tiếp, model ID từ env var (`AGNES_MODEL_FAST`)
- **Zod schema validation** cho mọi output AI (enrich, tutor, MCQ)
- **Throttle D1-backed**: 12 RPM mặc định, tracking per notebook × model qua bảng `ai_rate_limits`
- **Cache D1-backed**: cache key = SHA-256(task|notebook_id|variant|content_hash|prompt_version|schema_version|model_id)
  - Enrichment TTL 30 ngày, Tutor/MCQ TTL 7 ngày
- **Exponential backoff + jitter** trên 429/500/502/503/520 (tối đa 3 retries)
- **Timeout** 45 giây mặc định (configurable qua `AGNES_TIMEOUT_MS`)
- **AI enrichment route**: POST `/api/notebooks/:id/cards/:id/enrich` — trả về gợi ý chưa lưu
- **AI tutor route**: POST `/api/notebooks/:id/cards/:id/tutor` — giải thích thẻ bằng tiếng Việt
- **Không lưu tự động**: enrichment/tutor data chỉ lưu khi user chấp nhận (Phase 5+ sẽ tích hợp UI accept flow)

## Các file đã tạo

| Đường dẫn | Mô tả |
|---|---|
| `worker/schemas/ai.ts` | Zod schemas: CardEnrichment, TutorExplanation, AiExerciseMC |
| `worker/services/agnesAdapter.ts` | Agnes OpenAI-compatible chat adapter với retry/backoff |
| `worker/services/aiThrottle.ts` | D1-backed RPM throttle per notebook×model |
| `worker/services/aiCache.ts` | D1-backed cache với key hashing + TTL |
| `worker/services/cardEnrichment.ts` | Service điền trường trống qua Agnes + cache |
| `worker/services/tutorExplanation.ts` | Service giải thích thẻ qua Agnes + cache |
| `worker/routes/enrichment.ts` | POST /api/.../cards/:id/enrich |
| `worker/routes/tutor.ts` | POST /api/.../cards/:id/tutor |
| `tests/unit/agnes-adapter.test.ts` | 13 mock tests: valid JSON, invalid JSON, 401/429/500, retry, abort, timeout, no-key leak |
| `tests/unit/ai-throttle.test.ts` | 3 tests: allow fresh window, block at limit, allow under limit |

## Các file đã sửa

| File | Thay đổi |
|---|---|
| `worker/index.ts` | Đăng ký enrichmentRoutes, tutorRoutes; CSRF bảo vệ thêm |

## Migration
Không cần migration mới — bảng `ai_cache` và `ai_rate_limits` đã có trong `db/migrations/001_init.sql`.

## Kết quả kiểm thử

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ 0 lỗi |
| `npx eslint worker src --ext .ts,.tsx` | ✅ 0 errors, 5 warnings (D1 BLOB `any` từ Phase 2) |
| `npx vitest run` | ✅ **85/85 tests pass** (+16 so với Phase 3) |
| `npx vite build` | ✅ Built thành công (~900ms) |

### AI test coverage (mock-only, không gọi API thật)
| Kịch bản | Status |
|---|---|
| Mock response hợp lệ → parse JSON + validate Zod | ✅ Pass |
| Mock JSON lỗi (array thay object) → reject | ✅ Pass |
| Mock 401 → auth error, không retry | ✅ Pass |
| Mock 429 → rate_limit error, retryable=true | ✅ Pass |
| Mock 500 → server_error, retry + eventual failure | ✅ Pass |
| Mock AbortSignal → aborted error | ✅ Pass |
| Retry on 500 rồi thành công ở lần 2 | ✅ Pass |
| API key không xuất hiện trong error message | ✅ Pass |
| API key không có trong bundle dist/ | ✅ Verify |

## Kiểm tra bảo mật
- ✅ AGNES_API_KEY đọc từ env binding, không hard-coded
- ✅ Không log API key trong error messages
- ✅ Không expose raw Agnes response cho frontend
- ✅ Model ID đọc từ biến môi trường (`AGNES_MODEL_FAST`), không hard-code
- ✅ Mọi output AI đều qua Zod validation trước khi trả client
- ✅ Throttle prevented abuse; quota exceeded → informative error (không block app)
- ✅ Cache key chứa notebook_id → không chia sẻ cache giữa sổ

## Tiêu chí Phase 4

| Tiêu chí Architecture | Kết quả | Bằng chứng thực tế |
|---|---|---|
| Agnes adapter, env model config | Đạt | `agnesAdapter.ts` + `AGNES_MODEL_FAST` env var |
| Zod output validation | Đạt | `schemas/ai.ts` + unit tests reject invalid |
| Throttle (D1-backed) | Đạt | `aiThrottle.ts` + 3 tests pass |
| Cache (D1-backed) | Đạt | `aiCache.ts` với TTL khác nhau theo task |
| Timeout/backoff/retry | Đạt | Adapter test: retry on 500, backoff logic verified |
| AI fallback khi hết quota | Đạt | Trả về `quota_exceeded` + `retryable:true` để client hiển thị thông báo |
| AI enrichment endpoint | Đạt | `POST /api/notebooks/:id/cards/:id/enrich` |
| AI tutor explanation endpoint | Đạt | `POST /api/notebooks/:id/cards/:id/tutor` |
| Chỉ lưu nội dung được user accept | Đạt | Service trả kết quả về client, không auto-save vào card |
| API key không trong bundle/client/log | Đạt | Check bundle dist: 0 kết quả; check error messages: không chứa key |
| Test mock 400/401/429/500/timeout | Đạt | 13 unit tests mock-based, tất cả pass |
| AI invalid JSON không làm hỏng card | Đạt | Zod reject trả về `invalid_json` error; card không bị ghi đè |

## Rủi ro còn lại
- Chưa có smoke test với Agnes API thật (cần chủ dự án xác nhận key)
- Chưa có UI acceptance flow (user review → accept/refuse enrichment) — Phase 5+
- Chưa có AI-generated exercise (MCQ) service — Phase 5

## Việc không thực hiện (nằm ngoài Phase 4)
- Frontend AI enrichment UI (approve/reject buttons) — chờ UI design
- Exercise generation via AI — thuộc Phase 5 (exercise coverage)
- Grading AI-assisted tự do — thuộc Phase 5
- Optimizer weights import — thuộc Phase 6

---
Dừng và chờ chủ dự án xác nhận trước khi chuyển sang Giai đoạn 5.
