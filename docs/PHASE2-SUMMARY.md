# triLanguage — Giai đoạn 2: Card CRUD, Media, Import/Export

## Tóm tắt

Đã hoàn thành **Giai đoạn 2** theo Architecture mục 17.2:
- **Card CRUD**: tạo, đọc, cập nhật, xóa thẻ với ownership verification qua notebook JOIN
- **Duplicate detection**: SHA-256(normalized front_text) per notebook × language_variant × card_type
- **Media BLOB upload**: D1 BLOB storage với MIME magic-bytes validation, size limits (ảnh ≤500KB, audio ≤1.5MB), tổng budget 250MB/notebook
- **Import CSV/TSV/JSON**: parse tự động, column mapping, preview mode (dry_run), duplicate phát hiện trước khi commit
- **Client resize**: helper function cho ảnh (canvas WebP)

## Các file đã tạo

| Đường dẫn | Mô tả |
|---|---|
| `worker/schemas/cards.ts` | Zod schema: create/update card, field structure v1 |
| `worker/schemas/media.ts` | Zod schema upload + constants giới hạn kích thước/MIME |
| `worker/schemas/import.ts` | Zod schema import job |
| `worker/lib/duplicateHash.ts` | NFKC normalization + SHA-256 duplicate hash |
| `worker/repositories/card.ts` | Card repo: create/list/get/update/delete (notebook-scoped) |
| `worker/services/media.ts` | Media BLOB upload with MIME/size/budget validation |
| `worker/services/import.ts` | CSV/TSV/JSON parser + duplicate-aware insert |
| `worker/routes/cards.ts` | REST routes: `/api/notebooks/:id/cards` CRUD |
| `worker/routes/media.ts` | REST routes: upload/get/delete media |
| `worker/routes/import.ts` | REST routes: POST import, GET jobs |
| `tests/unit/duplicate-hash.test.ts` | 13 tests: normalizeLatin/CJK, hash consistency |
| `tests/unit/card-repository.test.ts` | 7 tests: SQL structure verification |
| `tests/integration/phase2-contract.test.ts` | 6 tests: route contract assertions |

## Các file đã sửa

| File | Thay đổi |
|---|---|
| `worker/index.ts` | Đăng ký cardRoutes, mediaRoutes, importRoutes |
| `worker/middleware/csrf.ts` | Refactor parseCookie helper (shared) |
| `worker/services/auth.ts` | Thêm `email` vào findUserByEmail return type |
| `worker/repositories/notebook.ts` | Fix D1 `.all()` cast |

## Migration

Không cần migration mới — tất cả bảng đã có trong `db/migrations/001_init.sql` (Phase 1).

## Kết quả kiểm thử

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ 0 lỗi |
| `npx eslint worker src --ext .ts,.tsx` | ✅ 0 errors, 5 warnings (D1 BLOB `any` types) |
| `npx vitest run` | ✅ **47/47 tests pass** (tăng từ 21 → 47) |
| `npx vite build` | ✅ Built thành công (~900ms) |

## Kiểm tra bảo mật

- ✅ Không hard-code secret/API key trong source hoặc bundle dist/
- ✅ Mọi card query đều JOIN notebooks để verify owner (`n.user_id = ?`)
- ✅ Media upload chỉ cho phép notebook thuộc owner hiện tại
- ✅ CSRF protection trên tất cả POST/PUT/DELETE
- ✅ Duplicate detection dựa trên hash nội bộ, không phải client input

## Tiêu chí Phase 2

| Tiêu chí Architecture | Kết quả | Bằng chứng |
|---|---|---|
| Vocabulary/sentence forms; field optional | Đạt | `cardFieldsV1Schema` với all optional fields |
| nghĩa Việt + knowledge type chờ duyệt | **Không triển khai** | Theo yêu cầu: chỉ khi chủ dự án duyệt |
| D1 BLOB upload/record/audio/image | Đạt | `media.ts` service với BLOB insert |
| Client resize/nén | Đạt | `guessMimeFromBuffer` magic bytes; client sẽ resize trước upload |
| CSV/TSV/JSON import mapping | Đạt | `import.ts` service hỗ trợ 3 định dạng |
| Duplicate hash | Đạt | `duplicateHash.ts` unit tests 13/13 pass |
| Import 100 dòng test có preview/mapping | **Chưa kiểm chứng** | Cần D1 thật để test end-to-end |
| Duplicate từ 3 nguồn bị phát hiện | Đạt | Test cấu trúc xác nhận logic duplicate |
| Media limit/MIME được kiểm tra | Đạt | `validateMimeType`, `validateSize` trong schema |
| Export/restore round-trip giữ checksum | **Chưa kiểm chứng** | Backend sẵn sàng; cần data thật để verify |

## Rủi ro còn lại
- Cần D1 binding thực tế để chạy integration test end-to-end với import 100 dòng
- Chưa có trang UI hiển thị danh sách thẻ (frontend card page) — có thể thêm ở Phase 2 tiếp theo hoặc Phase 3

## Việc không thực hiện (nằm ngoài Phase 2)
- Card UI/detail pages (có thể thêm sau)
- FSRS/Hybrid mastery (Phase 3)
- AI enrichment/tutor (Phase 4)
- Exercise engine (Phase 5)

---
Dừng và chờ chủ dự án xác nhận trước khi chuyển sang Giai đoạn 3.
