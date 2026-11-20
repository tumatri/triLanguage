# Hướng dẫn Deploy triLanguage lên Vercel + Supabase — Chi tiết từng bước

---

## Toàn cảnh kiến trúc

```
Người dùng truy cập
        │
        ▼
┌───────────────────────────────────────────────┐
│  Vercel (một nơi duy nhất)                     │
│                                               │
│  ├─ Frontend: React SPA (.html/.js/.css)     │
│  │    tại https://triLanguage-xxx.vercel.app   │
│  │                                            │
│  └─ API Routes: serverless functions          │
│       /api/auth/*     → bootstrap/login/logout │
│       /api/notebooks/* → CRUD sổ tay         │
│       /api/cards/*    → CRUD thẻ              │
│       /api/dashboard/* → thống kê             │
│       /api/enrichment/*→ AI enrich card       │
│            │                                  │
│            ▼                                  │
│      ┌─────────────────────┐                  │
│      │  Supabase           │                  │
│      │  ├── PostgreSQL     │ ← dữ liệu học    │
│      │  ├── Storage/bucket │ ← ảnh/audio      │
│      │  └── RLS policies   │ ← bảo mật        │
│      └─────────────────────┘                  │
│            │                                  │
│            ▼                                  │
│      ┌─────────────────────┐                  │
│      │  Agnes AI API       │ ← enrichment/tutor│
│      │  apihub.agnes-ai.com│                  │
│      └─────────────────────┘                  │
└───────────────────────────────────────────────┘
```

---

## PHẦN 1 — TẠO SUPABASE (30 phút)

### Bước 1.1: Đăng ký tài khoản

1. Mở **https://supabase.com/dashboard**
2. Bấm **Sign up** → chọn **Continue with GitHub** (nhanh nhất)
3. Xác nhận email nếu được yêu cầu

### Bước 1.2: Tạo project mới

1. Bấm nút **+ New project**
2. Điền thông tin:
   - **Organization**: `Personal` (mặc định)
   - **Name**: `triLanguage`
   - **Database Password**: tạo mật khẩu mạnh, ví dụ `TriLang@2026!xYz`
   - ⚠️ **GHI LẠI MẬT KHẨU NÀY NGAY** — không thể xem lại sau này
   - **Region**: chọn **Singapore** (`ap-southeast-1`) — gần Việt Nam nhất
   - Bấm **Create new project**
3. Chờ ~2 phút, trang hiện "Your project is being provisioned"

### Bước 1.3: Lấy credentials từ Supabase

Vào project vừa tạo → góc phải có chữ **"Connect"** hoặc vào **Settings (bánh răng)** → tab **API**:

Chụp lại 3 giá trị này:
```
Project URL : https://xxxxx.supabase.co
anon public key : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (chuỗi dài)
service_role secret : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (khác anon key)
```

⚠️ **Dịch vụ quan trọng:**
- `anon key` = quyền đọc/public — đưa cho frontend được
- `service_role key` = quyền admin đầy đủ — **chỉ để trong backend, KHÔNG bao giờ expose ra client**

Mở file `.env.local` trong thư mục dự án và điền:
```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Bước 1.4: Chạy migration SQL tạo bảng

Mở PowerShell, chạy lệnh (thay mật khẩu bạn đã đặt):
```powershell
$env:DATABASE_URL = "postgresql://postgres:<MẬT_KHẨU>@db.xxxxx.supabase.co:5432/postgres"
node scripts/db-migrate.mjs
```

✅ Nếu thành công sẽ hiện:
```
Executing 001_init.sql...
✓ 001_init.sql
Migration complete.
```

❓ Kiểm tra lại trong Supabase Dashboard → **Table Editor** — bạn sẽ thấy 18 bảng được tạo: `users`, `sessions`, `notebooks`, `cards`, `media`, ...

### Bước 1.5: Tạo bucket lưu media

1. Menu trái → **Storage** → **New bucket**
2. **Bucket name**: `media`
3. **Public bucket**: ✅ ON (cho phép đọc ảnh/audio từ URL công khai)
4. **File size limit**: giữ mặc định (50 MB/file)
5. Bấm **Create bucket**

### Bước 1.6: Cấu hình Row Level Security (RLS) cho storage

1. Vào **SQL Editor** (menu trái)
2. Dán và chạy đoạn SQL sau:

```sql
-- Cho phép bất kỳ ai cũng đọc file trong bucket media
CREATE POLICY "Allow public read on media" ON storage.objects
  FOR SELECT USING (bucket_id = 'media');

-- Cho phép người đã xác thực (có cookie session_token) upload/xóa
CREATE POLICY "Allow authenticated write on media" ON storage.objects
  FOR ALL WITH CHECK (bucket_id = 'media');
```

3. Bấm **Run** (hoặc Ctrl+Enter). Phải hiện "Success. No rows returned".

### Bước 1.7: Kích hoạt tính năng cần thiết (tùy chọn nhưng nên làm)

Vào **Authentication** → **Providers**:
- Bật **Email** (dùng làm phương thức phụ nếu muốn)

Vào **Database** → **Connection pooling**:
- Giữ mặc định, không cần chỉnh

---

## PHẦN 2 — ĐƯA CODE LÊN GITHUB (10 phút)

### Bước 2.1: Khởi tạo Git (nếu chưa có)

Mở PowerShell tại thư mục dự án:
```powershell
cd C:\Users\Admin\OneDrive\Desktop\triLanguage
git init
```

### Bước 2.2: Tạo repository trên GitHub

1. Mở https://github.com/new
2. Đặt **Repository name**: `triLanguage`
3. Chọn **Private** hoặc **Public** (Vercel support cả hai!)
4. **KHÔNG** tích chọn "Add a README", ".gitignore", hay license
5. Bấm **Create repository**
6. Copy dòng URL hiện ra, ví dụ:
   ```
   https://github.com/yourname/triLanguage.git
   ```

### Bước 2.3: Push code lên GitHub

Trong PowerShell (thay `yourname` bằng username thật):
```powershell
git remote add origin https://github.com/yourname/triLanguage.git
git branch -M master
git add .
git commit -m "feat: initial commit — Supabase + Vercel migration"
git push -u origin master
```

Lần đầu bị hỏi username/password → nhập **username** GitHub và **Personal Access Token** (không phải password thường). Cách tạo token:
- GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
- Generate new token → chọn scope `repo` → Generate
- Dùng token đó thay password khi push

### Bước 2.4: Xóa file nhạy cảm khỏi git (quan trọng!)

Kiểm tra file `.gitignore` có những dòng sau:
```
.env
.env.local
*.local
node_modules/
dist/
```

Nếu chưa có, tạo mới:
```powershell
@'
node_modules/
dist/
.env
.env.local
*.local
.DS_Store
coverage/
.wrangler/
supabase/
'@ | Out-File -Encoding utf8 .gitignore
git add .gitignore && git commit -m "fix: ensure secrets are gitignored"
```

---

## PHẦN 3 — DEPLOY LÊN VERCEL (15 phút)

### Bước 3.1: Đăng ký và cài đặt Vercel

#### Cách A — Cài CLI (tiền xử lý vài lần deploy thủ công)

```powershell
npm install -g vercel
vercel login
```
Chọn đăng nhập bằng **GitHub**.

#### Cách B — Chỉ dùng dashboard (đủ cho tự động deploy)

Truy cập trực tiếp https://vercel.com/new → đăng nhập GitHub là xong. CLI chỉ cần cho local dev hoặc deploy thủ công.

### Bước 3.2: Import project từ GitHub

1. Mở **https://vercel.com/dashboard**
2. Bấm **Add New...** → **Project**
3. Dưới mục **Import** sẽ hiện list repositories từ GitHub
4. Tìm `triLanguage` → bấm **Import**
5. Điền cấu hình:
   - **Framework Preset**: chọn `Other`
   - **Root Directory**: `/`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm ci`
6. Bấm **Deploy**
7. Chờ ~1-2 phút → Vercel hiện URL tạm thời như `triLanguage-xxx.vercel.app`

### Bước 3.3: Thêm Environment Variables (BẮT BUỘC)

Vào Project Vercel vừa tạo → tab **Settings** → **Environment Variables**:

Thêm từng biến theo bảng dưới (bấm **+ Add** mỗi cái):

| Tên biến | Giá trị | Môi trường | Ghi chú |
|---|---|---|---|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Production, Preview, Development | Từ Bước 1.3 |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Production, Preview, Development | Anon key từ Bước 1.3 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | **Production only** | Service role key từ Bước 1.3 |
| `AGNES_API_KEY` | `sk-R138ILl3LuY65xN4mOSFuwZ5N6300Oh3yXRXnubva2zbapN6` | Production, Preview, Development | Key Agnes AI của bạn |
| `SESSION_SECRET` | random 64 hex chars | Production, Preview, Development | Sinh bên dưới |
| `AGNES_BASE_URL` | `https://apihub.agnes-ai.com/v1` | Production, Preview, Development | Mặc định |
| `AGNES_MODEL_FAST` | `agnes-2.5-flash` | Production, Preview, Development | Model mặc định |
| `AGNES_TIMEOUT_MS` | `45000` | Production, Preview, Development | 45 giây timeout |
| `AGNES_MAX_RPM` | `12` | Production, Preview, Development | 12 requests/phút |
| `SESSION_TTL_SECONDS` | `86400` | Production, Preview, Development | Session 24 giờ |

🔑 Để sinh SESSION_SECRET an toàn, mở PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Kết quả giống: `a1b2c3d4e5f6...` (64 ký tự hex) — copy dán vào ô Value.

### Bước 3.4: Trigger redeploy với env vars

Sau khi thêm đủ env vars:
1. Vào tab **Deployments**
2. Click vào deployment gần nhất (màu xám "failed" hoặc chưa có env)
3. Bấm nút **Redeploy** → **Redeploy**
4. Chờ ~1-2 phút đến khi chuyển sang xanh lá "Ready"

### Bước 3.5: Kiểm tra website đang live

Mở URL hiển thị trong Vercel Dashboard, ví dụ:
```
https://triLanguage-xxx.vercel.app
```

---

## PHẦN 4 — KIỂM TRA HOẠT ĐỘNG

### Bước 4.1: Bootstrap tài khoản admin (chỉ làm 1 lần)

Mở trình duyệt tại:
```
https://triLanguage-xxx.vercel.app/bootstrap
```

- Nhập email: `admin@trilanguage.vn`
- Nhập mật khẩu: `StrongPass123!` (đổi sau)
- Bấm **Create Account**

Nếu hiện lỗi "Owner already exists" nghĩa là đã có admin rồi.

### Bước 4.2: Login

Mở:
```
https://triLanguage-xxx.vercel.app/login
```
Đăng nhập bằng tài khoản vừa tạo.

### Bước 4.3: Tạo notebook đầu tiên

Sau khi login:
1. Bấm **Create Notebook**
2. Name: `Tiếng Trung cơ bản`
3. Language variant: `zh-Hant`
4. Timezone: giữ mặc định
5. Bấm **Create**

### Bước 4.4: Tạo thẻ mẫu

Vào notebook → **Add Card**:
- Front text: `蘋果`
- Card type: `vocab`
- Bấm **Save**

### Bước 4.5: Test AI Enrichment

Tại trang card vừa tạo, bấm **Enrich with AI**:
- Nếu hiện kết quả với nghĩa tiếng Việt → ✅ Agnes AI hoạt động tốt
- Nếu lỗi 429 → rate limit, chờ 1 phút thử lại
- Nếu lỗi 500 → kiểm tra lại `AGNES_API_KEY` trong Vercel env vars

### Bước 4.6: Upload media (ảnh/audio)

1. Tại card `蘋果`, bấm **Upload Media**
2. Chọn ảnh hoặc file âm thanh (≤ 500KB ảnh, ≤ 1.5MB audio)
3. Kiểm tra trong Supabase Dashboard → **Storage** → bucket `media` → file đã xuất hiện

---

## PHẦN 5 — CUSTOM DOMAIN (tùy chọn)

### Bước 5.1: Mua domain

Gợi ý nhà cung cấp:
- **Cloudflare Registrar**: giá gốc, không markup
- **Namecheap**: rẻ, hỗ trợ tốt
- Mua tên miền như `trilanguage.vn` hoặc `myvocab.app`

### Bước 5.2: Cấu hình DNS trỏ về Vercel

Sau khi mua domain, vào trang quản lý DNS và thêm record:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `www` | `cname.vercel-dns.com` | Auto |
| CNAME | `@` (hoặc bỏ trống) | `cname.vercel-dns.com` | Auto |

### Bước 5.3: Thêm domain trong Vercel

1. Vercel Dashboard → Project → **Settings** → **Domains**
2. Bấm **Add** → nhập tên domain (ví dụ `trilanguage.vn`)
3. Bấm **Add Domain**
4. Vercel tự verify CNAME — chờ ~5 phút
5. HTTPS tự động kích hoạt bởi Vercel (Let's Encrypt)

Website cuối cùng: `https://trilanguage.vn` 🎉

---

## PHẦN 6 — QUY TRÌNH CẬP NHẬT SAU NÀY

### Cách 1 — Tự động (khuyến nghị)

Chỉ cần push code lên GitHub, Vercel tự động rebuild + redeploy:
```powershell
git add .
git commit -m "fix: sửa lỗi đăng nhập"
git push origin master
```
Vào Vercel Dashboard → Deployments để xem progress. Khi xanh lá → website cập nhật ngay.

### Cách 2 — Thủ công (khi cần can thiệp)

```powershell
vercel --prod
```
Hoặc dùng CLI:
```powershell
vercel link      # connect project lần đầu
vercel --prod    # force deploy production
```

### Cách 3 — Preview deployments

Khi tạo Pull Request trên GitHub, Vercel tự động tạo URL preview cho branch đó. Kiểm tra tại https://vercel.com/<user>/triLanguage/deployments

---

## PHỤ LỤC — BẢNG SO SÁNH CHI PHÍ

| Hạng mục | Chi phí free tier | Khi nào phải trả tiền |
|---|---|---|
| Vercel Hosting | Unlimited static pages | $20/tháng nếu >100GB bandwidth/tháng |
| Vercel Serverless Functions | 100k req/ngày, 10s timeout | $20/tháng nếu vượt quá |
| Supabase Postgres | 1 GB database, 2 connections | $25/tháng (Pro plan) |
| Supabase Storage | 1 GB files | $2/GB/tháng sau 1 GB |
| Agnes AI | Phụ thuộc credit key free | Theo gói Token Plan của Agnes |

### Ước tính chi phí thực tế cho cá nhân học

- < 100 notebook × 50 cards = ~5 MB dữ liệu text trong Postgres ✅ Free
- ~100 ảnh/audio × 300 KB = ~30 MB trong Storage ✅ Free
- ~1000 req/ngày cho auth/cards/notebooks ✅ Free
- ~50 AI calls/tháng cho enrichment ✅ Free

**Tổng: ~$0/tháng indefinitely** 🎯

---

## PHỤ LỤC — CHỮA LỖI THƯỜNG GẶP

### Lỗi 1: "Missing SUPABASE_URL"
→ Chưa thêm env var trong Vercel. Vào Settings → Environment Variables → add `SUPABASE_URL`.

### Lỗi 2: Login thất bại — "Invalid credentials"
→ Mật khẩu sai hoặc `SESSION_SECRET` khác giữa các lần deploy. Đảm bảo `SESSION_SECRET` đồng nhất trong mọi environment.

### Lỗi 3: Upload ảnh lỗi "Storage object not found"
→ Bucket `media` chưa tạo hoặc RLS policy chưa đúng. Kiểm tra trong Supabase Storage.

### Lỗi 4: AI enrichment trả về lỗi 429 (rate limit)
→ Key Agnes hết credit hoặc RPM vượt giới hạn. Đổi key trong Vercel env vars → Redeploy.

### Lỗi 5: Website hiển thị blank page
→ Check browser console (F12). Thường do thiếu env var `VITE_SUPABASE_*` hoặc route bị 404. Kiểm tra trong Vercel Logs.

### Lỗi 6: Database connection timeout
→ Supabase free tier có giới hạn 2 concurrent connections. Tăng timeout trong code hoặc đóng connection sau khi dùng.
