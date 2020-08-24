from gensim.models import word2vec
from nltk.corpus import stopwords
from sklearn.ensemble import RandomForestClassifier
import re, numpy as np, pickle, sys, random

TRAIN_MODEL = False
model = None
forest = None

def split_string(str, c):
    ret = []
    curr = ""
    for char in str:
        if char == c:
            if len(curr): ret.append(curr)
            curr = ""
        else: curr+=char
    if len(curr): ret.append(curr)
    return ret

def clean_sentence(str):
    str = re.sub("[^a-zA-Z]", " ", str)
    str = split_string(str.lower(),' ')
    stop = set(stopwords.words("english"))
    ret = []
    for x in str:
        if not x in stop:
            ret.append(x)
    return ret

def solve(str):
    sentences = split_string(str.strip(), '.')
    ret = []
    for sentence in sentences:
        if len(sentence) > 0:
            ret.append(clean_sentence(sentence))
    return ret

def clean_review(str):
    idx = 0
    for i in range(len(str)):
        if str[i] == ' ':
            idx = i
            break
    rating = str[0:idx]
    rating = ord(rating[-1])-ord('0')
    if rating == 1: rating = 1
    else: rating = 5
    str = str[idx+1:]
    return rating, str

def _averageFeatures(par, model, f):
    ave = np.zeros(f, dtype = 'float32')
    wordset = set(model.wv.index2word)
    cnt = 0
    for word in par:
        if word in wordset:
            cnt += 1
            ave = np.add(ave, model[word])
    return cnt, np.divide(ave, cnt)

def get_ave(data, model, f, ratings, needRatings):
    num_valid = 0
    for review in data:
        amount, res = _averageFeatures(review, model, f)
        if amount != 0: num_valid += 1

    ave = np.zeros((num_valid, f), dtype = 'float32')
    ret = []
    cnt = 0
    idx = 0
    for review in data:
        amount, res = _averageFeatures(review,model,f)
        idx += 1
        if amount == 0: continue
        ave[cnt] = res
        if needRatings:
            ret.append(ratings[idx-1])
        cnt += 1
    return ave, ret

def get_paragraph_average(str, model, f):
    split_str = solve(str)
    a,b = get_ave(split_str,model,f,None,False)
    return a

if TRAIN_MODEL:
    f = open("IgnitionHacks2020Train.txt", "r")
    full_data, ratings = [], []
    counter = 0

    TRAIN_LIMIT = 500000

    for review in f:
        rating, t_str = clean_review(review)
        ratings.append(rating)
        data = clean_sentence(t_str)
        full_data.append(data)
        # data = solve(t_str)
        # for sentence in data:
        #     full_data.append(sentence)
        counter += 1
        if counter == TRAIN_LIMIT:
            break

    random.shuffle(full_data)

    print("training model")
    model = word2vec.Word2Vec(
        full_data,
        size = 300,
        window = 10,
        sample = 1e-3
    )
    model.init_sims(replace = True)
    model.save("IgnitionHacks2020")
    print("getting proper data")
    full_data = []
    counter = 0
    for review in f:
        rating, t_str = clean_review(review)
        data = solve(t_str)
        tt = []
        for sentence in data:
            tt += sentence
        full_data.append(tt)
        counter += 1
        if counter == TRAIN_LIMIT:
            break
    print("getting average vectors")
    aveVecs, rr = get_ave(full_data, model, 300, ratings, True)
    print(len(aveVecs))
    print(len(rr))
    print("creating forest model")
    forest = RandomForestClassifier(n_estimators = 100)

    print("training classifier")
    forest = forest.fit(aveVecs, rr)
    pickle.dump(forest, open("IgnitionHacks2020Forest", "wb"))

    print("done")
else:
    model = word2vec.Word2Vec.load("IgnitionHacks2020")
    forest = pickle.load(open("IgnitionHacks2020Forest", "rb"))

strr = sys.argv[1]
split_str = solve(strr)
tmp = []
for sentence in split_str:
    tmp += sentence
pr = ""
for word in tmp: pr = pr + word + " "
print(pr)
pr = ""
for word in tmp: pr = pr + str(forest.predict(get_paragraph_average(word, model, 300))[0]) + " "
print(pr)