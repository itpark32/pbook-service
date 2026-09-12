FROM golang:1.22-alpine AS build
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 go build -o /backend .

FROM build AS test
RUN go test ./...

FROM alpine:3.20
RUN apk add --no-cache wget
COPY --from=build /backend /backend
COPY migrations /migrations
EXPOSE 8080
CMD ["/backend"]
