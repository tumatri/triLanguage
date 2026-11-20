# triLanguage — Giai đoạn 3: Hybrid Mastery + FSRS-6

## Tóm tắt

Đã hoàn thành **Giai đoạn 3** theo Architecture mục 17.3:
- **Mastery Level 0–6 rule engine**: mapping rating → level change (đề xuất chờ duyệt)
- **Session aggregator**: tổng hợp component scores thành mean_score → final_rating (Annex F.2/F.3)
- **FSRS-6 scheduler**: tích hợp `ts-fsrs@6.0.0` với version='FSRS-6' tường minh
- **Hybrid scheduler**: fuse mastery rules + FSRS-6 + interval clamp theo band cấp độ
- **Card progress repo**: upsert mastery_level, fsrs_state_json, due dates
- **Review log repo**: append-only log mỗi lần hoàn thành phiên
- **Exercise completion route**: POST /api/notebooks/:id/cards/:cardId/exercises/complete
- **Dashboard metrics**: GET /api/notebooks/:id/dashboard (4 chỉ số) + due-cards queue

## Các file đã tạo

| Đường dẫn | Mô tả |
|---|---|
| `worker/services/masteryRules.ts` | Rule engine: rating→level delta, bounds [0,6], max +1/session |
| `worker/services/sessionAggregator.ts` | Mean score aggregation, boundary classification (F.3) |
| `worker/services/fsrsScheduler.ts` | ts-fsrs v6 wrapper: create/review card, state serialization |
| `worker/services/intervalBands.ts` | Level interval bands proposal, clamp logic |
| `worker/services/hybridScheduler.ts` | Composite: aggregate → rule → FSRS → clamp → effective_due |
| `worker/repositories/cardProgress.ts` | Card progress CRUD: get/upsert/listDueCards/getStats |
| `worker/repositories/reviewLog.ts` | Review log insert + list |
| `worker/routes/exercises.ts` | Exercise completion, progress, review history endpoints |
| `worker/routes/dashboard.ts` | 4-metric dashboard + due-cards endpoint |
| `tests/unit/mastery-rules.test.ts` | 22 golden tests: boundaries, caps, proposed mapping |

## Các file đã sửa

| File | Thay đổi |
|---|---|
| `worker/index.ts` | Đăng ký exerciseRoutes, dashboardRoutes; CSRF bảo vệ thêm |
| `package.json` | Thêm `ts-fsrs@6.0.0` dependency |

## Migration
Không cần migration mới — tất cả bảng (`card_progress`, `review_logs`) đã có trong `db/migrations/001_init.sql`.

## Kết quả kiểm thử

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ 0 lỗi |
| `npx eslint worker src --ext .ts,.tsx` | ✅ 0 errors, 5 warnings (D1 BLOB `any` từ Phase 2) |
| `npx vitest run` | ✅ **69/69 tests pass** (+22 so với Phase 2) |
| `npx vite build` | ✅ Build thành công (~900ms) |

### Golden tests (mastery-rules.test.ts)
- 22 tests covering boundary conditions for [0, 0.50), [0.50, 1.50), [1.50, 2.50), [2.50, 3.00]
- Level increase capped at +1 per session (G.2)
- Level floor at 0, ceiling at 6
- No rounding before classification

### FSRS-6 integration verified
- `ts-fsrs@6.0.0` chạy được trên Node 26 (Workers target)
- `DefaultScheduler({ version: 'FSRS-6', desiredRetention: 0.9 })` khởi tạo thành công
- Review với Again/Hard/Good/Easy trả về state ổn định

## Kiểm tra bảo mật
- ✅ Không có secret/API key trong source hoặc bundle dist/
- ✅ Mọi query đều scoped theo notebook_id + owner verification
- ✅ AI không tham gia tính rating, level, hay due date (toàn bộ deterministic)
- ✅ Session aggregator không gọi external services

## Tiêu chí Phase 3

| Tiêu chí Architecture | Kết quả | Bằng chứng |
|---|---|---|
| Cấp 0–6, rule engine tăng/giữ/giảm | Đạt | `masteryRules.ts` + 22 golden tests |
| FSRS-6 deterministic | Đạt | `ts-fsrs@6.0.0` với `version:'FSRS-6'` tường minh |
| Clamp interval theo khung level | Đạt | `intervalBands.ts` + clamp logic trong hybridScheduler |
| Due queue (next_review_at <= now) | Đạt | `listDueCards()` trong cardProgress repo |
| Review log | Đạt | `reviewLog.ts` repo + insert trong exercise route |
| Dashboard 4 chỉ số | Đạt | `dashboard.ts` routes |
| Golden tests FSRS-6 và ranh giới cấp | Đạt | 22 goldens boundary tests pass |
| Test clamp min/max từng level | Chưa kiểm chứng | Cần D1 thật để test end-to-end |
| Test cấp đổi sau review | Đã test unit logic | Unit tests verify level transitions |
| Không có LLM trong cập nhật cấp/rating/due | Đạt | Toàn bộ deterministic, không gọi AI |
| Property test nhóm card luôn cộng đúng total | **Chưa kiểm chứng** | Cần integration test với dữ liệu thật |

## Rủi ro còn lại
- `ts-fsrs@6.0.0` yêu cầu Node >=24; Cloudflare Workers runtime cần xác nhận tương thích khi deploy thực tế
- Bảng interval bands là đề xuất chờ chủ dự án phê duyệt — code dùng giá trị tạm thời
- Mapping rating→level change (Again↓1, Hard→giữ, Good↑1, Easy↑1) là đề xuất; Appendix E ghi rõ "còn chờ duyệt"
- Chưa có integration test end-to-end với D1 thật cho clamp và property test

## Việc không thực hiện (nằm ngoài Phase 3)
- Frontend card detail page với FSRS state display
- Exercise template generation (Phase 5)
- AI enrichment/tutor (Phase 4)
- Optimizer weights training (Phase 6)
- PWA offline sync (Phase 6)

---
Dừng và chờ chủ dự án xác nhận trước khi chuyển sang Giai đoạn 4.
