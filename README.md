Run
python generic_manga_crawler.py --config mangarw.config.json

Crawl only title + chapter list:

python generic_manga_crawler.py --config mangarw.config.json

Crawl images too:

python generic_manga_crawler.py --config mangarw.config.json --crawl-images

Test one manga:

python generic_manga_crawler.py --config mangarw.config.json --manga-id 1 --max-chapters 3 --crawl-images

Crawl one chapter:

python generic_manga_crawler.py --config mangarw.config.json --chapter-id 10