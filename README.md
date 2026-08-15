# Manga Web / Generic Manga Crawler

Repo này là phần Next.js UI/API cho hệ thống crawl manga. Crawler Python nằm ở:

```bash
/home/opc/manga-crawler/generic_manga_crawler.py
```

Ảnh local, nếu site bật chế độ lưu local, mặc định nằm ở:

```bash
/home/opc/manga-storage
```

## Các repo được auto push

`auto-git-push.sh` sẽ push các repo code sau:

```bash
/home/opc/manga-web
/home/opc/manga-crawler
```

`/home/opc/manga-storage` không được push vì đây là folder dữ liệu ảnh, có thể rất nặng.

Script chạy theo flow:

1. Ghi log vào `/home/opc/manga-web/.git/auto-push.log`.
2. Dùng lock `/tmp/manga-auto-push.lock` để tránh chạy trùng.
3. Scan các folder `/home/opc/manga-*` và chỉ xử lý folder có `.git`.
4. Với từng repo tìm được:
   - bỏ qua nếu không có `.git`;
   - bỏ qua nếu đang merge/rebase;
   - chỉ chạy trên branch `develop`;
   - `git add --all`;
   - commit nếu có thay đổi;
   - push lên `origin develop`.

## Cách chạy crawler

Chạy bằng config JSON file:

```bash
cd /home/opc/manga-crawler
python generic_manga_crawler.py --config mangarw.config.json
```

Chạy bằng config đã đăng ký trong database:

```bash
python generic_manga_crawler.py --site-key mangarw
```

Crawl title + chapter list, chưa crawl ảnh:

```bash
python generic_manga_crawler.py --site-key mangarw
```

Crawl cả ảnh:

```bash
python generic_manga_crawler.py --site-key mangarw --crawl-images
```

Test một manga:

```bash
python generic_manga_crawler.py --site-key mangarw --manga-id 1 --max-chapters 3 --crawl-images
```

Crawl lại chapter list cho một manga, không crawl ảnh:

```bash
python generic_manga_crawler.py --site-key mangarw --manga-id 1 --skip-title-list
```

Crawl ảnh của một chapter local:

```bash
python generic_manga_crawler.py --site-key mangarw --chapter-id 10
```

## Luồng xử lý của `generic_manga_crawler.py`

### 1. Load config

Crawler có 2 cách đọc config:

- `--config path.json`: đọc trực tiếp từ file JSON.
- `--site-key xxx`: đọc JSON từ bảng `crawler_sites.config`.

Khi đọc từ DB, crawler cũng lấy thêm:

- `store_images_locally`: site có lưu ảnh local không.
- `local_image_storage_path`: nếu có thì lưu ảnh vào folder custom, nếu không thì dùng default `/home/opc/manga-storage`.

### 2. Migrate database trước khi chạy

Schema phải được tạo bằng các migration trong `db/` ở bước deploy. Web app và
crawler không tự chạy `CREATE TABLE`, `CREATE INDEX` hoặc `ALTER TABLE` trong
runtime. Nếu schema còn thiếu, hãy dừng deploy, chạy migration rồi mới khởi động
PM2/crawler.

Các bảng crawler sử dụng gồm:

- `crawler_sites`: config và trạng thái crawl của từng site.
- `manga_titles`: title theo từng `site_key`.
- `manga_details`: mô tả, trạng thái crawl, thời gian crawl ảnh.
- `manga_chapters`: chapter theo từng title.
- `chapter_images`: URL ảnh, local path, content type.

Quan trọng:

- `manga_titles` unique theo `(site_key, href)`, nên cùng một title URL có thể thuộc nhiều config/site khác nhau.
- `manga_chapters` unique theo `(manga_title_id, href)`, nên cùng một chapter URL có thể thuộc nhiều title/site khác nhau.

### 3. Crawl danh sách title

Nếu không dùng `--skip-title-list` và không chỉ định `--manga-id`, crawler sẽ:

1. Mở URL list trong config: `list.url`.
2. Tính số page bằng pagination config.
3. Với từng page, dùng selector trong config:
   - `list.item_selector`
   - `list.href`
   - `list.title`
   - `list.image`
4. Upsert vào `manga_titles`.

Có thể giới hạn page cần crawl bằng key `crawl_page` trong JSON config:

```json
{
  "site_key": "example",
  "crawl_page": [1, 2, 3],
  "list": {
    "url": "https://example.com/danh-sach",
    "page_param": "page"
  }
}
```

`crawl_page` hỗ trợ:

- Số đơn: `"crawl_page": 1`
- Mảng số: `"crawl_page": [1, 2, 3]`
- Chuỗi phân tách bằng dấu phẩy: `"crawl_page": "1,2,3"`

Nếu không có key `crawl_page`, hoặc để rỗng (`""`, `[]`), crawler sẽ crawl toàn bộ page của site gốc như trước.

### 4. Crawl detail và chapter list

Sau khi có title, crawler chạy `crawl_library(...)`:

1. Lấy title theo `site_key`, hoặc một title nếu có `--manga-id`.
2. Mở trang detail của title.
3. Lấy description nếu config có `detail.description`.
4. Lấy danh sách chapter bằng:
   - `detail.chapters.link_selector`
   - `detail.chapters.title_sources`
   - optional `detail.chapters.published`
   - optional `source_id_query_param` hoặc `source_id_regex`
5. Upsert vào `manga_chapters`.
6. Nếu không có `--crawl-images`, dừng ở đây và set status `chapters_completed`.

### 5. Crawl ảnh chapter

Nếu có `--crawl-images`, crawler sẽ crawl ảnh cho các chapter còn thiếu:

1. Với từng chapter, kiểm tra `chapter_has_images`.
2. Nếu đã có ảnh thì skip.
3. Nếu chưa có ảnh:
   - mở reader URL của chapter;
   - lấy ảnh bằng `reader.image_selector`;
   - lấy src bằng `reader.image_attrs`.
4. Nếu site không lưu local:
   - lưu URL trực tiếp vào `chapter_images.src`.
5. Nếu site lưu local:
   - tải ảnh bằng `requests`;
   - gửi `Referer` là chapter URL;
   - lưu vào `{storage_root}/chapters/{chapter_id}/00000.ext`;
   - lưu `local_path` và `content_type` vào DB.

### 6. Các mode chính

`--site-key mangarw`

- Refresh title list.
- Crawl detail/chapter list.
- Không crawl ảnh.

`--site-key mangarw --crawl-images`

- Refresh title list.
- Crawl detail/chapter list.
- Crawl ảnh còn thiếu.

`--site-key mangarw --manga-id 1 --skip-title-list`

- Không refresh toàn bộ title list.
- Crawl lại chapter list cho đúng title `id=1`.
- Không crawl ảnh.

`--site-key mangarw --manga-id 1 --skip-title-list --crawl-images`

- Crawl lại chapter list cho title `id=1`.
- Crawl ảnh còn thiếu của title đó.

`--site-key mangarw --chapter-id 10`

- Crawl ảnh cho đúng chapter local `id=10`.

## Luồng từ UI Next.js

Màn register config:

1. Người dùng nhập JSON config.
2. App lưu vào `crawler_sites`.
3. Có thể bật/tắt `Local` để chọn lưu ảnh local hay dùng URL trực tiếp.
4. Nếu bật `Local`, có thể nhập custom path. Để trống thì dùng default.

Màn list titles:

- `Switch Site`: đổi site config.
- `Crawled`: lọc title đã crawl ảnh.
- `Chapters > 0`: lọc title có chapter.
- `Sort chapters`: sort theo số chapter tăng hoặc giảm.
- `Load log`: đọc log crawler.
- `Clear crawled data`: xoá chapter, ảnh, AI response, history; giữ lại title list.
- Nút download trên từng title: crawl chapter list và ảnh còn thiếu.
- Nút refresh trên từng title: crawl lại chapter list, không crawl ảnh.

Màn đọc manga:

1. App đọc `chapter_images`.
2. Nếu site dùng local storage thì ảnh render qua `/api/images/[id]`.
3. Nếu không thì render trực tiếp URL ảnh gốc.
4. Người dùng chọn ảnh bằng checkbox tròn rồi mở AI chat bằng nút AI nổi.
5. Translate image cache kết quả theo `image_id` trong DB để lần sau không gọi AI lại.

### Amazon Bedrock image translation

Image translation supports OpenClaw and Amazon Bedrock. Configure the allowed
models in `.env.local`; AWS credentials remain server-side and are resolved by
the standard AWS SDK credential chain.

```env
AI_TRANSLATION_PROVIDER=openclaw
OPENCLAW_MODELS=openclaw

BEDROCK_REGION=us-east-1
BEDROCK_MODELS=amazon.nova-lite-v1:0,amazon.nova-pro-v1:0
BEDROCK_DEFAULT_MODEL=amazon.nova-lite-v1:0

# Use these only when the server does not have an IAM role or AWS profile.
AWS_ACCESS_KEY_ID=replace-me
AWS_SECRET_ACCESS_KEY=replace-me
# AWS_SESSION_TOKEN=replace-me
```

The IAM principal needs `bedrock:InvokeModel` permission and model access in
the configured region. The model dropdown is populated from `OPENCLAW_MODELS`
and `BEDROCK_MODELS`. Bulk Translate has the same provider/model selector as
the reader and stores that selection with its background job. Translation
cache is image-specific: any provider/model result marks the image completed.

The reader also accepts an optional custom OpenClaw model name. Leaving this
field empty uses `OPENCLAW_MODEL`; entering a value overrides the model only
for image translation, image chat, and uncached phrase analysis requests.
Bedrock model names remain restricted to `BEDROCK_MODELS`. Cached translations
and phrase analyses are still read from the database without calling a model.
Manual and bulk image translation use the newest cached translation regardless
of provider/model. AI is called only when the image has no translation in the
database.

### Background EPUB export to Google Drive

The EPUB action on a title detail page creates the book in a background job,
stores progress in `manga_epub_export_jobs`, uploads the finished file to Google
Drive, and exposes the Drive view/download links in the UI. A title is split into
EPUB parts of at most 100 readable chapters. Each part is uploaded and its local
temporary file is removed before the next part is built. Apply the migrations:

```bash
psql "$DATABASE_URL" -f db/021_epub_export_jobs.sql
psql "$DATABASE_URL" -f db/022_epub_export_parts.sql
```

Enable Google Drive API for the Google Cloud project, create a service account,
and share the destination Drive folder with the service account email as an
Editor. Configure one of the standard Google credential sources:

```bash
# Recommended: path to the service-account JSON file.
GOOGLE_APPLICATION_CREDENTIALS=/secure/path/google-service-account.json

# Alternative: the complete service-account JSON on one line.
# GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Optional. Without this, the file is uploaded to the account's Drive root.
GOOGLE_DRIVE_FOLDER_ID=your_google_drive_folder_id

# Optional. Keep false for private files; true creates an anyone/reader link.
GOOGLE_DRIVE_MAKE_PUBLIC=false
```

Service accounts have no personal Drive storage quota. They can upload only to
a Google Workspace Shared Drive. For a normal My Drive folder, configure OAuth
for the human Google account that owns the storage instead; OAuth takes priority
over service-account credentials when all three values are present:

```bash
GOOGLE_DRIVE_OAUTH_CLIENT_ID=your_oauth_client_id
GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=your_oauth_client_secret
GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=your_offline_refresh_token
```

Alternatively, use the single `GOOGLE_DRIVE_OAUTH` setting. It accepts a raw
refresh token (combined with the client ID/secret above), inline JSON containing
all three values, or a path to such a JSON file:

```bash
GOOGLE_DRIVE_OAUTH=your_offline_refresh_token

# Or:
# GOOGLE_DRIVE_OAUTH=/secure/path/google-drive-oauth.json
# {"client_id":"...","client_secret":"...","refresh_token":"..."}
```

Generate the refresh token with offline access and the
`https://www.googleapis.com/auth/drive` scope. The configured Google user must
have Editor access to `GOOGLE_DRIVE_FOLDER_ID`.

Credentials stay server-side. Temporary EPUB files are removed after upload or
failure. A process restart interrupts an active in-process export; opening the
title again marks that job as failed so it can be retried.
