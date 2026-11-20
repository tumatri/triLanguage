# triLanguage — Giai đoạn 6: Placement, Skill Profile, Optimizer, Offline

## Tóm tắt

Đã hoàn thành **Giai đoạn 6** theo Architecture mục 17.6:
- **Placement test**: adaptive scoring deterministic (không dùng LLM), estimate 0–100 per skill với confidence dựa trên sample count
- **Skill profile repo**: upsert/get theo notebook × skill, lưu vào bảng `skill_profiles`
- **Placement route**: POST /api/placement (submit answers), GET /api/placement/profiles/:nbId
- **IndexedDB Outbox store**: Dexie-backed local queue cho offline review/card-progress sync
- **Sync route**: POST /api/sync/outbox xử lý queued operations idempotent
- **Optimizer**: schema sẵn sàng (`fsrs_parameters` table); việc huấn luyện weights giữ offline/manual theo Architecture §9.4

## Các file đã tạo

| Đường dẫn | Mô tả |
|---|---|
| `worker/schemas/placement.ts` | Zod schema + types cho placement run & skill profile |
| `worker/repositories/skillProfile.ts` | upsert/get skill profiles, create/complete placement runs |
| `worker/services/placementTest.ts` | Adaptive scoring: accuracy×difficulty→estimate, sample-count→confidence |
| `worker/routes/placement.ts` | POST /placement, GET /placement/profiles/:id |
| `worker/routes/sync.ts` | POST /sync/outbox — idempotent batch apply |
| `src/offline/types.ts` | OutboxEntry interface |
| `src/offline/outboxStore.ts` | Dexie wrapper: enqueue/getPending/markSynced/pruneSynced |
| `tests/unit/placement-test.test.ts` | 7 tests: neutral/no-answer/accuracy/difficulty/confidence scaling/cap |
| `tests/unit/skill-profile-repository.test.ts` | 4 tests: upsert insert/update, get empty/all |

## Các file đã sửa

| File | Thay đổi |
|---|---|
| `worker/index.ts` | Đăng ký placementRoutes, syncRoutes; CSRF bảo vệ thêm |
| `package.json` | Thêm `dexie` dependency |

## Migration
Không cần migration mới — bảng `skill_profiles`, `placement_runs`, `fsrs_parameters` đã có trong `db/migrations/001_init.sql`.

## Kết quả kiểm thử

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ 0 lỗi |
| `npx eslint worker src --ext .ts,.tsx` | ✅ 0 errors, 15 warnings (pre-existing D1 BLOB `any`) |
| `npx vitest run` | ✅ **123/123 tests pass** (+11 so với Phase 5) |
| `npx vite build` | ✅ Thành công |

### Placement scoring logic verified
- 0 answers → estimate 50, confidence 0 cho mọi skill
- 10 correct at difficulty 3 → estimate > 50, confidence > 0
- 10 wrong at difficulty 4 → estimate < 50
- 20 samples → confidence ~50 (medium range)
- 35 perfect high-difficulty → estimate 100, confidence ≥ 67 (high range)
- Difficulty bonus: hard questions answered correctly push estimate higher than easy ones

### Confidence tiers match Architecture proposal
- `<10` samples → low (0–33)
- `10–29` samples → medium (33–67)
- `>=30` samples → high (67–100)

## Kiểm tra bảo mật
- ✅ Không secret/API key trong source hoặc bundle dist/
- ✅ Placement scoring thuần deterministic, không gọi AI
- ✅ Sync route verify notebook ownership trước khi apply mỗi item
- ✅ Outbox entries có notebook_id để scope đúng

## Tiêu chí Phase 6

| Tiêu chí Architecture | Kết quả | Bằng chứng |
|---|---|---|
| Placement test adaptive, score 0–100 per skill | Đạt | `placementTest.ts` + 7 unit tests |
| Confidence theo sample count (<10/10–29/≥30) | Đạt | Tests verify confidence scaling |
| Profile không dùng LLM làm nguồn điểm | Đạt | Toàn bộ deterministic code, không call Agnes |
| FSRS-6 optimizer offline/manual theo notebook | **Không áp dụng** (Phase 6 chỉ setup schema) | Bảng `fsrs_parameters` đã có; optimizer training giữ offline theo §9.4 |
| IndexedDB outbox và sync conflict handling | Đạt | `outboxStore.ts` + sync route idempotent upsert |
| Offline review đồng bộ idempotent, không duplicate review log | Đạt | `INSERT OR IGNORE` trong sync handler |
| Restore trên browser khác thành công | **Chưa kiểm chứng** | Cần end-to-end test với PWA thật |

## Rủi ro còn lại
- Dexie loaded dynamically với `require`/dynamic import — có thể gặp vấn đề với Vite tree-shaking nếu không cấu hình đúng
- Chưa có frontend UI cho placement test flow (Phase 7+)
- Chưa có automatic weight optimization — chỉ có schema sẵn sàng, việc train weights giữ offline/manual

## Việc không thực hiện (nằm ngoài Phase 6)
- Frontend placement test UI
- Automatic FSRS weight optimizer integration
- PWA Service Worker full implementation (chỉ có outbox store)
- E2E mobile/desktop tests (Phase 7)
- Quota dashboard, export reminder (Phase 7)

---
Dừng và chờ chủ dự án xác nhận trước khi chuyển sang **Giai đoạn 7** (Hardening / phát hành cá nhân).
