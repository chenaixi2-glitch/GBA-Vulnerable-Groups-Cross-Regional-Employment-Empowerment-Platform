# 静态前端：直接托管 individual/ 与根目录 landing 页面
FROM nginx:1.27-alpine

COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY assets /usr/share/nginx/html/assets
COPY individual /usr/share/nginx/html/individual
COPY corporate /usr/share/nginx/html/corporate

EXPOSE 80
