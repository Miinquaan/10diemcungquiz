# Thiết lập tạo quiz từ lý thuyết

Chức năng này cần Supabase Edge Function và khóa Gemini API riêng. Commit lên GitHub Pages chỉ đưa giao diện lên, không tự cài đặt hoặc triển khai Edge Function.

1. Tạo dự án và khóa trong Google AI Studio, kiểm tra mô hình `gemini-3.5-flash-lite` có hạn mức miễn phí trong dự án của bạn. Duy trì dự án ở Free Tier nếu muốn tránh sử dụng gói trả phí. Hạn mức hoặc mô hình có thể thay đổi theo tài khoản và thời gian.
2. Trong Supabase SQL Editor, chạy nội dung `supabase/migrations/202611160001_gemini_quota.sql` một lần. Hàm chỉ cho người đăng nhập tạo tối đa 5 lượt/ngày/người và 25 lượt/ngày/toàn web, tính theo UTC. Giới hạn này chỉ giảm sử dụng, không phải bảo đảm không phát sinh phí nếu dùng dự án Gemini có bật thanh toán.
   Sau đó chạy `supabase/migrations/202611170001_ai_quota_admin_stats.sql` để bỏ trần 25 lượt chung và bật trang thống kê cho admin. Hạn mức Gemini thực tế vẫn áp dụng cho toàn project. Lượt thất bại sau khi gọi cũng có thể bị tính.
   Chạy tiếp `supabase/migrations/202611170002_ai_usage_history.sql` để lưu thời điểm các yêu cầu mới và hiển thị lịch sử cho admin; các lượt trước khi cài không thể phục hồi thời điểm chi tiết.
3. Trong Supabase Edge Functions, thêm secret `GEMINI_API_KEY` bằng giá trị khóa Gemini. Không đưa khóa vào Git, website hoặc cuộc trò chuyện. Có thể đặt thêm secret `GEMINI_MODEL` để chọn mô hình được tài khoản hỗ trợ.
4. Triển khai `supabase/functions/generate-theory-quiz/index.ts` thành Edge Function `generate-theory-quiz` với xác thực JWT bật. Hàm cũng tự kiểm tra người dùng qua Supabase Auth.
5. Đăng nhập web và thử một đề cương không có thông tin cá nhân. Kiểm tra, sửa toàn bộ câu và đáp án trước khi lưu. Google có thể dùng nội dung gửi tới gói miễn phí để cải thiện sản phẩm.

Nếu dùng Supabase CLI đã liên kết với đúng dự án, lệnh triển khai sau khi chạy migration là:

```powershell
supabase functions deploy generate-theory-quiz
```

Secret nên được nhập qua Supabase Dashboard thay vì gõ vào lệnh để tránh lưu trong lịch sử lệnh. PDF dạng ảnh, hình vẽ và tệp `.doc` cũ chưa được hỗ trợ đọc nội dung.
