git tag -d $2
ncc build index.js --license licenses.txt
git add -A
git commit -S -m "$1"
git push
git tag $2
git push --tags
