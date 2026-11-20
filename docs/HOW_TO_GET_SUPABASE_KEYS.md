# ═══════════════════════════════════════
# Hướng dẫn lấy 3 giá trị từ Supabase Dashboard
# ═══════════════════════════════════════

## BƯỚC 1: Đăng nhập và tạo project (nếu chưa có)

1. Mở https://supabase.com/dashboard
2. Sign up bằng GitHub (nhanh nhất, không cần thẻ thanh toán)
3. Bấm **+ New project**

4. Điền form:
   - **Organization**: Personal (mặc định)
   - **Name**: triLanguage
   - **Database password**: tạo mật khẩu mới (ví dụ `MySupa@Pass2026`)
     ⚠️ GHI LẠI MẬT KHẨU NÀY — không xem lại được sau này!
   - **Region**: chọn **Singapore** (gần VN nhất)
   - Bấm **Create new project**

5. Chờ ~2 phút, trang chuyển sang dashboard của project.

---

## BƯỚC 2: Lấy 3 giá trị cần thiết

### Giá trị 1: Project URL

1. Trên dashboard project, nhìn góc phải trên cùng có nút màu xanh lá **「Project Settings」** hoặc icon **bánh răng ⚙️**
2. Click vào → tab **「API」** (mặc định mở ra)
3. Tìm mục **「Project URL」**
4. Copy chuỗi dạng: `https://xxxxx.supabase.co`

→ Ghi lại thành: `SUPABASE_URL=https://xxxxx.supabase.co`

### Giá trị 2: Anon public key

Cùng trang **Settings → API**, tìm mục **「anon public key」**

- Nhìn thấy một chuỗi dài bắt đầu bằng `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- Click nút **「Copy」** bên cạnh để copy

→ Ghi lại thành: `SUPABASE_ANON_KEY=eyJ...`

⚠️ Đây là key công khai, an toàn để đưa vào frontend.

### Giá trị 3: Service role secret key

Cũng trang **Settings → API**, cuộn xuống dưới, tìm mục **「service_role secret」**

- Click nút **「Reveal」** để hiện ra key
- Copy chuỗi dài bắt đầu `eyJ...` (khác với anon key)

→ Ghi lại thành: `SUPABASE_SERVICE_ROLE_KEY=eyJ...`

⚠️ Đây là key admin — có quyền đầy đủ đọc/ghi/xoá mọi bảng. Cầm giữ bí mật, KHÔNG đưa vào frontend.

---

## BƯỚC 3: Xác nhận đã copy đủ

Bạn sẽ có 3 dòng như thế này (thay bằng giá trị thật):

```
SUPABASE_URL = "https://abc123def456.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiYzEyM2RlZjQ1NiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzMwMDAwMDAwLCJleHAiOjE4ODc3NjY0MDB9.abcdefghijklmnop"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiYzEyM2RlZjQ1NiIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MzAwMDAwMDAsImV4cCI6MTg4Nzc2NjQwMH0.zyxxwwvvuuttssrrqqppoobbaayyxwwvvuutt"
```

Send cho tôi cả 3 giá trị này, tôi sẽ chạy migration và deploy luôn.