# Hướng dẫn Deploy triLanguage lên Vercel — Mới nhất

## Kiến trúc sau khi chuyển sang Vercel

```
┌─────────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  GitHub (code)      │─────▶│  CI: test + build │─────▶│  Vercel         │
│                     │      │  (typecheck +     │      │  Hosting        │
│  master branch      │      │   157 tests)     │      │  • Frontend      │
└─────────────────────┘      └──────────────────┘      │  • API Routes    │
                                                        │  (/api/*)        │
                                                        └────────┬────────┘
                                                                 │
                                                                  ▼
                                                          ┌─────────────────┐
                                                          │  Supabase       │
                                                          │  PostgreSQL     │
                                                          │  + Storage      │
                                                          └─────────────────┘
```

**Lợi ích so với Render:**
- ✅ **Tự động deploy** mỗi lần `git push` — không cần chạy lệnh thủ công
- ✅ Hỗ trợ **repo Private** trên GitHub
- ✅ **Frontend + Backend cùng một nơi** — không cần quản lý 2 hosting
- ✅ Custom domain miễn phí kèm theo
- ⚠️ Serverless có timeout ~10s cho mỗi request (AI calls ngắn hơn đã được xử lý)

---

## BƯỚC 1: Đưa code lên GitHub

### 1.1 Tạo repository

1. Mở https://github.com/new
2. Đặt tên repo: `triLanguage`
3. Chọn **Private** hoặc **Public** (cả hai đều hoạt động với Vercel)
4. Bấm **Create repository**

### 1.2 Push code từ máy tính

```powershell
cd C:\Users\Admin\OneDrive\Desktop\triLanguage
git remote add origin https://github.com/<TÊN-GITHUB>/triLanguage.git
git push -u origin master
```

> Nếu bị hỏi credentials, dùng **Personal Access Token** (tạo tại GitHub Settings → Developer settings → Personal access tokens).

---

## BƯỚC 2: Tạo project Supabase

### 2.1 Đăng ký và tạo project

1. Truy cập https://supabase.com/dashboard
2. Đăng nhập bằng GitHub (miễn phí, không cần thẻ)
3. Bấm **New project**
4. Điền:
   - **Name**: `triLanguage`
   - **Database password**: tạo mật khẩu mạnh, **ghi lại ngay**
   - **Region**: Singapore (`ap-southeast-1`)
5. Chờ ~2 phút để provisioning hoàn tất

### 2.2 Lấy credentials

Vào project → **Settings** (góc phải) → **API**:
- **Project URL**: `https://xxxxx.supabase.co`
- **anon public key**: chuỗi `eyJ...`

Vào **Settings** → **Database**: copy connection string:
```
postgresql://postgres:<MẬT_KHẨU>@db.xxxxx.supabase.co:5432/postgres
```

### 2.3 Chạy migration SQL

```powershell
$env:DATABASE_URL = "postgresql://postgres:<MẬT_KHẨU>@db.xxx.supabase.co:5432/postgres"
node scripts/db-migrate.mjs
```

Nếu thành công:
```
Executing 001_init.sql...
✓ 001_init.sql
Migration complete.
```

### 2.4 Tạo bucket lưu media

1. Vào **Storage** → **New bucket**
2. Tên: `media`, **Public bucket**: ON
3. Bấm **Create bucket**

### 2.5 Cấu hình RLS cho storage (SQL Editor)

```sql
CREATE POLICY "media_read_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

CREATE POLICY "media_write_authenticated" ON storage.objects FOR ALL
  WITH CHECK (bucket_id = 'media');
```

### 2.6 Lấy Service Role Key

Vào **Settings** → **API** → cuộn xuống **Service Role Secret** → **Copy**.

---

## BƯỚC 3: Connect Vercel với GitHub

### 3.1 Kết nối repository

1. Truy cập https://vercel.com/dashboard
2. Bấm **Add New...** → **Project**
3. Chọn repository `triLanguage` → bấm **Import**
4. Cấu hình:
   - **Framework Preset**: `Other`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm ci`
5. Bấm **Deploy**

### 3.2 Thêm Environment Variables

Vào Project → **Settings** → **Environment Variables** → thêm:

| Variable | Giá trị | Môi trường |
|---|---|---|
| `SUPABASE_URL` | `https://xxx.supabase.co` | Production, Preview, Development |
| `SUPABASE_ANON_KEY` | `eyJ...` (anon key) | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (service role) | **Production only** |
| `AGNES_API_KEY` | `sk-R138...` | Production, Preview, Development |
| `SESSION_SECRET` | random 64 hex chars | Production, Preview, Development |
| `AGNES_BASE_URL` | `https://apihub.agnes-ai.com/v1` | All |
| `AGNES_MODEL_FAST` | `agnes-2.5-flash` | All |
| `AGNES_TIMEOUT_MS` | `45000` | All |
| `AGNES_MAX_RPM` | `12` | All |
| `SESSION_TTL_SECONDS` | `86400` | All |

Để sinh SESSION_SECRET:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3.3 Trigger deploy lần đầu

Sau khi thêm đủ env vars, vào **Deployments** → **Redeploy** → chọn deployment gần nhất → **Redeploy**.

Website sẽ sẵn tại: `https://triLanguage-xxx.vercel.app`

---

## BƯỚC 4: Kiểm tra & Sử dụng

### 4.1 Bootstrap tài khoản admin

Mở browser: `https://triLanguage-xxx.vercel.app/bootstrap`
- Nhập email + mật khẩu
- Đây là tài khoản duy nhất trên hệ thống

### 4.2 Login

`https://triLanguage-xxx.vercel.app/login`

### 4.3 Kiểm tra AI

Trang `/settings` → kiểm tra kết nối Agnes AI

### 4.4 Upload media

Tạo notebook → tạo card → upload ảnh/audio → kiểm tra trong Supabase Storage bucket `media`

---

## BƯỚC 5: Cập nhật code (sau này)

Khi muốn publish sửa lỗi hoặc nâng cấp:

```powershell
# Sửa code xong, commit và push
git add .
git commit -m "fix: mô tả thay đổi"
git push origin master
```

**Vercel sẽ tự động:**
1. Chạy CI (typecheck + 157 tests)
2. Build frontend
3. Deploy serverless functions mới
4. Hoàn tất trong ~1-2 phút

Không cần chạy `vercel --prod` thủ công!

---

## Bảng chi phí

| Dịch vụ | Chi phí | Giới hạn free |
|---|---|---|
| Vercel (frontend + API) | $0 | 100GB bandwidth/tháng |
| Supabase Postgres | $0 | 1 GB database |
| Supabase Storage | $0 | 1 GB files |
| Agnes AI | $0 theo plan | Phụ thuộc credit key |
| **Tổng** | **$0/tháng** | |

> ⚠️ **Lưu ý**: Vercel serverless functions có timeout **~10 giây**. Nếu gọi Agnes AI mất quá lâu, request sẽ timeout và fallback sang exercise template (đã xử lý trong code).

---

## Câu hỏi thường gặp

**Q: Repo private được không?**
A: Được. Vercel hỗ trợ private repo miễn phí.

**Q: Cần dùng custom domain?**
A: Không bắt buộc. Dùng mặc định `*.vercel.app`. Muốn domain riêng thì thêm tại Vercel Dashboard → Settings → Domains.

**Q: Supabase pause sau 7 ngày không hoạt động?**
A: Có thể xảy ra. Giải pháp: truy cập dashboard Supabase ít nhất 1 lần/tuần, hoặc set cron ping nhẹ.

**Q:/API route nào chưa implement?**
A: Các route cốt lõi đã có: auth (bootstrap/login/logout), notebooks CRUD, cards CRUD, enrichment AI. Cần mở rộng thêm route nào báo lại.
