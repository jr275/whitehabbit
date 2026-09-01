# ==================================================================
# EXTRACTION SERVICE
#
# The only PHP in the product. Wraps j0k3r/graby and its site-config
# corpus behind POST /extract.
#
# SECURITY POSTURE:
#   · runs as a non-root user
#   · read-only root filesystem is safe (nothing is written at runtime)
#   · NO EGRESS is required — the service never fetches. Deny outbound
#     network at the platform level; it cannot then become an SSRF
#     proxy even if compromised.
#   · no database, no secrets, no tenant data
#   · never publicly reachable — private networking only
# ==================================================================
FROM php:8.3-cli-alpine AS base

# tidy is graby's one hard extension requirement (HTML repair).
RUN apk add --no-cache tidyhtml tidyhtml-dev libxml2-dev icu-dev \
 && docker-php-ext-install -j"$(nproc)" tidy dom mbstring \
 && apk del tidyhtml-dev libxml2-dev icu-dev

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --optimize-autoloader \
 && rm -rf /root/.composer

COPY public/ ./public/

RUN addgroup -S extractor && adduser -S -G extractor extractor \
 && chown -R extractor:extractor /app
USER extractor

ENV EXTRACTOR_PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD php -r 'exit(@file_get_contents("http://127.0.0.1:8080/healthz") ? 0 : 1);'

# The built-in server is adequate here: one endpoint, CPU-bound work,
# horizontal scaling by replica. Swap for FPM+nginx if a single
# replica ever needs internal concurrency.
CMD ["sh", "-c", "php -S 0.0.0.0:${EXTRACTOR_PORT} -t public"]
